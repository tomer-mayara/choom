use process_wrap::std::ChildWrapper;
use std::{
    collections::BTreeMap,
    io,
    mem::{offset_of, size_of},
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    thread,
    time::{Duration, Instant},
};
use windows::{
    Win32::{
        Foundation::{
            ERROR_ACCESS_DENIED, ERROR_INVALID_PARAMETER, ERROR_NO_MORE_FILES, HANDLE,
            INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
        },
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, TH32CS_SNAPTHREAD, THREADENTRY32, Thread32First,
                Thread32Next,
            },
            IO::{CreateIoCompletionPort, GetQueuedCompletionStatus},
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, IsProcessInJob,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_ASSOCIATE_COMPLETION_PORT,
                JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JobObjectAssociateCompletionPortInformation, JobObjectBasicAccountingInformation,
                JobObjectBasicProcessIdList, JobObjectExtendedLimitInformation,
                QueryInformationJobObject, SetInformationJobObject, TerminateJobObject,
            },
            SystemServices::JOB_OBJECT_MSG_NEW_PROCESS,
            Threading::{
                OpenProcess, OpenThread, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
                PROCESS_TERMINATE, ResumeThread, THREAD_SUSPEND_RESUME, TerminateProcess,
                WaitForSingleObject,
            },
        },
    },
    core::{BOOL, HRESULT},
};

const MAX_TRACKED_PROCESSES: usize = 1024;
const NOTIFICATIONS_PER_POLL: usize = 64;

/// Owns a kill-on-close job whose membership can be observed after its leader exits.
pub(crate) struct WindowsJob {
    handle: OwnedHandle,
    completion_port: OwnedHandle,
    processes: BTreeMap<u32, TrackedProcess>,
}

struct TrackedProcess {
    handle: OwnedHandle,
    verified: bool,
    termination_attempted: bool,
}

/// Returning to a thread pool must also release the job port's thread association.
struct CompletionPortDetachment {
    port: OwnedHandle,
    detached: bool,
}

impl CompletionPortDetachment {
    fn new() -> io::Result<Self> {
        Ok(Self {
            port: owned(
                unsafe { CreateIoCompletionPort(INVALID_HANDLE_VALUE, None, 0, 1) }
                    .map_err(io::Error::other)?,
            ),
            detached: false,
        })
    }

    fn detach(&mut self) -> io::Result<()> {
        if self.detached {
            return Ok(());
        }
        let mut message = 0;
        let mut key = 0;
        let mut value = std::ptr::null_mut();
        // Switching to this private, empty port releases the former association.
        // Closing it when this guard drops then leaves the thread unassociated.
        match unsafe {
            GetQueuedCompletionStatus(
                HANDLE(self.port.as_raw_handle()),
                &mut message,
                &mut key,
                &mut value,
                0,
            )
        } {
            Err(error)
                if error.code() == HRESULT::from_win32(WAIT_TIMEOUT.0) && value.is_null() =>
            {
                self.detached = true;
                Ok(())
            }
            Err(error) => Err(io::Error::other(error)),
            Ok(()) => Err(io::Error::other("unexpected observer detachment packet")),
        }
    }
}

impl Drop for CompletionPortDetachment {
    fn drop(&mut self) {
        // The explicit call reports errors; unwinding makes a final detachment attempt.
        let _ = self.detach();
    }
}

#[repr(C)]
struct ProcessIds {
    assigned: u32,
    listed: u32,
    ids: [usize; MAX_TRACKED_PROCESSES],
}

fn owned(handle: HANDLE) -> OwnedHandle {
    // The caller just received a new owned Windows handle from a successful API call.
    unsafe { OwnedHandle::from_raw_handle(handle.0) }
}

impl WindowsJob {
    pub fn assign(child: &dyn ChildWrapper) -> io::Result<Self> {
        let process = child
            .process_handle()
            .ok_or_else(|| io::Error::other("missing process handle"))?;
        // The child is still suspended, so it cannot start descendants before assignment.
        let mut job = Self {
            handle: owned(unsafe { CreateJobObjectW(None, None) }.map_err(io::Error::other)?),
            completion_port: owned(
                unsafe { CreateIoCompletionPort(INVALID_HANDLE_VALUE, None, 0, 1) }
                    .map_err(io::Error::other)?,
            ),
            processes: BTreeMap::new(),
        };
        job.processes.insert(
            child.id(),
            TrackedProcess {
                handle: process.try_clone_to_owned()?,
                verified: false,
                termination_attempted: false,
            },
        );
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        // The information pointer addresses a correctly sized, live structure.
        unsafe {
            SetInformationJobObject(
                job.raw(),
                JobObjectExtendedLimitInformation,
                &limits as *const _ as _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        }
        .map_err(io::Error::other)?;
        let association = JOBOBJECT_ASSOCIATE_COMPLETION_PORT {
            CompletionKey: job.raw().0,
            CompletionPort: HANDLE(job.completion_port.as_raw_handle()),
        };
        // Associate the port while the job is empty, before its suspended child can run.
        unsafe {
            SetInformationJobObject(
                job.raw(),
                JobObjectAssociateCompletionPortInformation,
                &association as *const _ as _,
                size_of::<JOBOBJECT_ASSOCIATE_COMPLETION_PORT>() as u32,
            )
        }
        .map_err(io::Error::other)?;
        unsafe { AssignProcessToJobObject(job.raw(), HANDLE(process.as_raw_handle())) }
            .map_err(io::Error::other)?;
        job.processes
            .get_mut(&child.id())
            .expect("the direct child is retained")
            .verified = true;
        Ok(job)
    }

    fn raw(&self) -> HANDLE {
        HANDLE(self.handle.as_raw_handle())
    }

    pub fn resume(&self, process_id: u32) -> io::Result<()> {
        // std::process exposes the process handle, but not its initial thread handle.
        // A suspended fresh child has one thread; enumerate it before resuming execution.
        let snapshot = owned(
            unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) }.map_err(io::Error::other)?,
        );
        let mut entry = THREADENTRY32 {
            dwSize: size_of::<THREADENTRY32>() as u32,
            ..Default::default()
        };
        unsafe { Thread32First(HANDLE(snapshot.as_raw_handle()), &mut entry) }
            .map_err(io::Error::other)?;
        loop {
            if entry.th32OwnerProcessID == process_id {
                let thread = owned(
                    unsafe { OpenThread(THREAD_SUSPEND_RESUME, false, entry.th32ThreadID) }
                        .map_err(io::Error::other)?,
                );
                let previous = unsafe { ResumeThread(HANDLE(thread.as_raw_handle())) };
                if previous == u32::MAX {
                    return Err(io::Error::last_os_error());
                }
                if previous == 0 {
                    return Err(io::Error::other("process was not suspended"));
                }
                return Ok(());
            }
            match unsafe { Thread32Next(HANDLE(snapshot.as_raw_handle()), &mut entry) } {
                Ok(()) => {}
                Err(error) if error.code() == HRESULT::from_win32(ERROR_NO_MORE_FILES.0) => {
                    return Err(io::Error::other("suspended process thread was not found"));
                }
                Err(error) => return Err(io::Error::other(error)),
            }
        }
    }

    pub fn terminate(&self) -> io::Result<()> {
        unsafe { TerminateJobObject(self.raw(), 1) }.map_err(io::Error::other)
    }

    /// Retain reported process identities before observing whether the parent exited.
    /// A full batch yields to the caller; cleanup must also observe an empty queue.
    pub fn observe(&mut self, deadline: Instant) -> io::Result<bool> {
        // Allocate before the first real dequeue so allocation failure cannot strand a thread.
        let mut detachment = CompletionPortDetachment::new()?;
        let observed = self.observe_batch(deadline);
        detachment.detach()?;
        observed
    }

    fn observe_batch(&mut self, deadline: Instant) -> io::Result<bool> {
        self.verify_members(deadline)?;
        for _ in 0..NOTIFICATIONS_PER_POLL {
            before_deadline(deadline)?;
            let mut message = 0;
            let mut key = 0;
            let mut value = std::ptr::null_mut();
            let received = unsafe {
                GetQueuedCompletionStatus(
                    HANDLE(self.completion_port.as_raw_handle()),
                    &mut message,
                    &mut key,
                    &mut value,
                    0,
                )
            };
            match received {
                Err(error)
                    if error.code() == HRESULT::from_win32(WAIT_TIMEOUT.0) && value.is_null() =>
                {
                    self.verify_members(deadline)?;
                    return Ok(true);
                }
                Err(error) => return Err(io::Error::other(error)),
                Ok(()) => {}
            }
            if key != self.raw().0 as usize {
                return Err(io::Error::other("unexpected job notification"));
            }
            if message == JOB_OBJECT_MSG_NEW_PROCESS {
                // Job notifications encode a PID in this pointer; it is never dereferenced.
                let pid = u32::try_from(value as usize)
                    .map_err(|_| io::Error::other("invalid job process ID"))?;
                if pid == 0 {
                    return Err(io::Error::other("invalid job process ID"));
                }
                self.capture(&[pid], deadline)?;
            }
        }
        self.verify_members(deadline)?;
        Ok(false)
    }

    /// Hold process identities before requesting termination, then wait on those identities.
    pub fn stop(&mut self, deadline: Instant) -> io::Result<()> {
        loop {
            before_deadline(deadline)?;
            let queue_empty = self.observe(deadline)?;
            let pids = self.member_pids(deadline)?;
            self.capture(&pids, deadline)?;
            self.verify_members(deadline)?;
            for process in self.processes.values_mut() {
                before_deadline(deadline)?;
                let handle = HANDLE(process.handle.as_raw_handle());
                // After an accepted or denied request, only the held handle can establish exit.
                if !process.termination_attempted && !signaled(handle)? {
                    match unsafe { TerminateProcess(handle, 1) } {
                        Ok(()) => process.termination_attempted = true,
                        // Exit may race a failed request. Check this same process object.
                        Err(error) => {
                            let stopped = signaled(handle)?;
                            if error.code() == HRESULT::from_win32(ERROR_ACCESS_DENIED.0) {
                                // Teardown can deny a stop before signaling. Keep stopping others.
                                process.termination_attempted = true;
                            } else if !stopped {
                                return Err(io::Error::other(error));
                            }
                        }
                    }
                }
            }
            let mut all_stopped = true;
            for process in self.processes.values() {
                before_deadline(deadline)?;
                all_stopped &= signaled(HANDLE(process.handle.as_raw_handle()))?;
            }
            // Query again after all retained objects signal, catching later inherited children.
            if all_stopped
                && queue_empty
                && self.member_pids(deadline)?.is_empty()
                && self.coverage_complete(deadline)?
            {
                before_deadline(deadline)?;
                self.terminate()?;
                return before_deadline(deadline);
            }
            before_deadline(deadline)?;
            thread::sleep(
                Duration::from_millis(5).min(deadline.saturating_duration_since(Instant::now())),
            );
        }
    }

    fn capture(&mut self, pids: &[u32], deadline: Instant) -> io::Result<()> {
        for pid in pids {
            before_deadline(deadline)?;
            if self.processes.contains_key(pid) {
                continue;
            }
            if self.processes.len() >= MAX_TRACKED_PROCESSES {
                return Err(io::Error::other("job process tracking limit exceeded"));
            }
            let handle = match unsafe {
                OpenProcess(
                    PROCESS_SYNCHRONIZE | PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION,
                    false,
                    *pid,
                )
            } {
                Ok(handle) => owned(handle),
                Err(error) if error.code() == HRESULT::from_win32(ERROR_INVALID_PARAMETER.0) => {
                    continue;
                }
                Err(error) => return Err(io::Error::other(error)),
            };
            // Retain ownership before the membership query or any other fallible work.
            self.processes.insert(
                *pid,
                TrackedProcess {
                    handle,
                    verified: false,
                    termination_attempted: false,
                },
            );
        }
        Ok(())
    }

    fn verify_members(&mut self, deadline: Instant) -> io::Result<()> {
        let job = self.raw();
        let mut foreign = Vec::new();
        for (pid, process) in &mut self.processes {
            before_deadline(deadline)?;
            if !process.verified {
                let mut member = BOOL::default();
                unsafe {
                    IsProcessInJob(
                        HANDLE(process.handle.as_raw_handle()),
                        Some(job),
                        &mut member,
                    )
                }
                .map_err(io::Error::other)?;
                if member.as_bool() {
                    process.verified = true;
                } else {
                    foreign.push(*pid);
                }
            }
        }
        for pid in foreign {
            self.processes.remove(&pid);
        }
        Ok(())
    }

    fn member_pids(&self, deadline: Instant) -> io::Result<Vec<u32>> {
        before_deadline(deadline)?;
        let mut information = ProcessIds {
            assigned: 0,
            listed: 0,
            ids: [0; MAX_TRACKED_PROCESSES],
        };
        let mut written = 0;
        // repr(C) matches the native header and supplies a fixed, aligned PID buffer.
        unsafe {
            QueryInformationJobObject(
                Some(self.raw()),
                JobObjectBasicProcessIdList,
                &mut information as *mut _ as _,
                size_of::<ProcessIds>() as u32,
                Some(&mut written),
            )
        }
        .map_err(io::Error::other)?;
        before_deadline(deadline)?;
        let count = information.listed as usize;
        if count > MAX_TRACKED_PROCESSES
            || information.assigned != information.listed
            || (written as usize) < offset_of!(ProcessIds, ids) + count * size_of::<usize>()
            || written as usize > size_of::<ProcessIds>()
        {
            return Err(io::Error::other("job process snapshot is incomplete"));
        }
        let mut pids = Vec::with_capacity(count);
        for pid in &information.ids[..count] {
            before_deadline(deadline)?;
            let pid =
                u32::try_from(*pid).map_err(|_| io::Error::other("invalid job process ID"))?;
            if pid == 0 {
                return Err(io::Error::other("invalid job process ID"));
            }
            pids.push(pid);
        }
        Ok(pids)
    }

    fn coverage_complete(&self, deadline: Instant) -> io::Result<bool> {
        before_deadline(deadline)?;
        let information = self.accounting()?;
        before_deadline(deadline)?;
        if information.TotalProcesses as usize > MAX_TRACKED_PROCESSES {
            return Err(io::Error::other("job process tracking limit exceeded"));
        }
        let retained = self
            .processes
            .values()
            .filter(|process| process.verified)
            .count();
        // Notifications can be lost. Only retained, verified identities cover the history.
        Ok(information.TotalProcesses as usize == retained)
    }

    fn accounting(&self) -> io::Result<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION> {
        let mut information = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
        unsafe {
            QueryInformationJobObject(
                Some(self.raw()),
                JobObjectBasicAccountingInformation,
                &mut information as *mut _ as _,
                size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                None,
            )
        }
        .map_err(io::Error::other)?;
        Ok(information)
    }
}

fn signaled(handle: HANDLE) -> io::Result<bool> {
    match unsafe { WaitForSingleObject(handle, 0) } {
        WAIT_OBJECT_0 => Ok(true),
        WAIT_TIMEOUT => Ok(false),
        _ => Err(io::Error::last_os_error()),
    }
}

fn before_deadline(deadline: Instant) -> io::Result<()> {
    if Instant::now() >= deadline {
        Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "job cleanup expired",
        ))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        os::windows::io::AsHandle,
        os::windows::process::CommandExt,
        process::{Child, Command, Stdio},
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
    };
    use windows::Win32::System::Threading::{CREATE_SUSPENDED, DETACHED_PROCESS};

    struct SuspendedChild(Child);

    impl SuspendedChild {
        fn new() -> Self {
            // Neither fixture can run code or create a console or descendants.
            Self(
                Command::new("cmd.exe")
                    .args(["/C", "exit", "0"])
                    .creation_flags((CREATE_SUSPENDED | DETACHED_PROCESS).0)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .unwrap(),
            )
        }
        fn stop(&mut self) {
            self.0.kill().unwrap();
            self.0.wait().unwrap();
            assert!(signaled(HANDLE(self.0.as_raw_handle())).unwrap());
        }
    }

    impl Drop for SuspendedChild {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }

    #[test]
    fn missing_creation_notification_cannot_complete_cleanup_from_an_empty_job() {
        let mut parent = SuspendedChild::new();
        let mut job = WindowsJob::assign(&parent.0).unwrap();
        // Native notification loss is allowed. Remove the association to reproduce it reliably.
        let detached = JOBOBJECT_ASSOCIATE_COMPLETION_PORT {
            CompletionKey: job.raw().0,
            CompletionPort: HANDLE::default(),
        };
        unsafe {
            SetInformationJobObject(
                job.raw(),
                JobObjectAssociateCompletionPortInformation,
                &detached as *const _ as _,
                size_of::<JOBOBJECT_ASSOCIATE_COMPLETION_PORT>() as u32,
            )
        }
        .unwrap();
        let mut unreported = SuspendedChild::new();
        unsafe { AssignProcessToJobObject(job.raw(), HANDLE(unreported.0.as_raw_handle())) }
            .unwrap();
        parent.stop();
        unreported.stop();
        let deadline = Instant::now() + Duration::from_secs(5);
        assert!(job.member_pids(deadline).unwrap().is_empty());
        assert_eq!(job.accounting().unwrap().TotalProcesses, 2);
        assert_eq!(job.processes.len(), 1);
        let retained = job.processes[&parent.0.id()].handle.as_raw_handle();
        for _ in 0..2 {
            let result = job.stop(Instant::now() + Duration::from_millis(20));
            assert_eq!(result.unwrap_err().kind(), io::ErrorKind::TimedOut);
            assert_eq!(job.processes.len(), 1);
            assert_eq!(
                job.processes[&parent.0.id()].handle.as_raw_handle(),
                retained
            );
            assert!(signaled(HANDLE(retained)).unwrap());
        }
    }

    #[test]
    fn a_runnable_previous_observer_does_not_block_the_next_thread() {
        let mut parent = SuspendedChild::new();
        let mut job = WindowsJob::assign(&parent.0).unwrap();
        let active = Arc::new(AtomicBool::new(false));
        let running = Arc::new(AtomicBool::new(true));
        let worker_active = active.clone();
        let worker_running = running.clone();
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        let observer = thread::spawn(move || {
            let observed = job.observe(Instant::now() + Duration::from_secs(5));
            sender.send((job, observed)).unwrap();
            worker_active.store(true, Ordering::Release);
            // Waiting on a channel or mutex would hide the retained IOCP association.
            let deadline = Instant::now() + Duration::from_secs(10);
            while worker_running.load(Ordering::Acquire) && Instant::now() < deadline {
                std::hint::spin_loop();
            }
        });
        let (mut job, first) = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
        let start_deadline = Instant::now() + Duration::from_secs(5);
        while !active.load(Ordering::Acquire) && Instant::now() < start_deadline {
            thread::yield_now();
        }
        let was_active = active.load(Ordering::Acquire);
        let mut next = SuspendedChild::new();
        unsafe { AssignProcessToJobObject(job.raw(), HANDLE(next.0.as_raw_handle())) }.unwrap();
        let deadline = Instant::now() + Duration::from_secs(1);
        let mut observed = Ok(true);
        while !job.processes.contains_key(&next.0.id()) && Instant::now() < deadline {
            observed = job.observe(deadline);
            if observed.is_err() {
                break;
            }
            thread::yield_now();
        }
        let captured = job
            .processes
            .get(&next.0.id())
            .is_some_and(|process| process.verified);
        let remained_running = !observer.is_finished();
        running.store(false, Ordering::Release);
        observer.join().unwrap();
        parent.stop();
        next.stop();
        assert!(was_active);
        assert!(
            remained_running,
            "the prior observer must stay runnable throughout handoff"
        );
        first.unwrap();
        observed.unwrap();
        assert!(
            captured,
            "the former observer withheld the next process notification"
        );
        job.stop(Instant::now() + Duration::from_secs(5)).unwrap();
    }

    #[test]
    fn denied_termination_waits_for_that_identity_and_keeps_stopping_other_members() {
        for external_completion in [true, false] {
            let mut parent = SuspendedChild::new();
            let mut job = WindowsJob::assign(&parent.0).unwrap();
            let mut child = SuspendedChild::new();
            unsafe { AssignProcessToJobObject(job.raw(), HANDLE(child.0.as_raw_handle())) }
                .unwrap();
            let deadline = Instant::now() + Duration::from_secs(5);
            job.capture(&[child.0.id()], deadline).unwrap();
            job.verify_members(deadline).unwrap();
            // The first member denies termination, so stopping it must not block the next member.
            let (denied, other) = if parent.0.id() < child.0.id() {
                (&mut parent, &mut child)
            } else {
                (&mut child, &mut parent)
            };
            let readonly = owned(
                unsafe {
                    OpenProcess(
                        PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
                        false,
                        denied.0.id(),
                    )
                }
                .unwrap(),
            );
            let retained = readonly.as_raw_handle();
            job.processes.get_mut(&denied.0.id()).unwrap().handle = readonly;
            let external = if external_completion {
                let full = denied.0.as_handle().try_clone_to_owned().unwrap();
                let other_handle = other.0.as_handle().try_clone_to_owned().unwrap();
                Some(thread::spawn(move || {
                    let waited =
                        unsafe { WaitForSingleObject(HANDLE(other_handle.as_raw_handle()), 1000) };
                    if waited != WAIT_OBJECT_0 {
                        return Err(io::Error::other("cleanup did not stop the other member"));
                    }
                    unsafe { TerminateProcess(HANDLE(full.as_raw_handle()), 1) }
                        .map_err(io::Error::other)
                }))
            } else {
                None
            };
            let timeout = if external_completion {
                Duration::from_secs(2)
            } else {
                Duration::from_millis(20)
            };
            let outcome = job.stop(Instant::now() + timeout);
            let retry = if external_completion {
                None
            } else {
                Some(job.stop(Instant::now() + Duration::from_millis(20)))
            };
            let denied_stopped = signaled(HANDLE(retained)).unwrap();
            let other_stopped = unsafe {
                WaitForSingleObject(
                    HANDLE(other.0.as_raw_handle()),
                    if external_completion { 0 } else { 1000 },
                )
            } == WAIT_OBJECT_0;
            let still_owned = job.processes[&denied.0.id()].handle.as_raw_handle() == retained;
            let externally_stopped = external.map(|thread| thread.join().unwrap());
            // Stop fixtures before assertions, including the deliberately denied timeout case.
            if !signaled(HANDLE(denied.0.as_raw_handle())).unwrap() {
                denied.stop();
            }
            if !signaled(HANDLE(other.0.as_raw_handle())).unwrap() {
                other.stop();
            }
            denied.0.wait().unwrap();
            other.0.wait().unwrap();
            assert!(still_owned);
            assert!(
                other_stopped,
                "denied termination prevented another member from stopping"
            );
            if external_completion {
                externally_stopped.unwrap().unwrap();
                outcome.unwrap();
                assert!(denied_stopped);
            } else {
                assert_eq!(outcome.unwrap_err().kind(), io::ErrorKind::TimedOut);
                assert_eq!(retry.unwrap().unwrap_err().kind(), io::ErrorKind::TimedOut);
                assert!(
                    !denied_stopped,
                    "the denied request must not be treated as completion"
                );
                job.stop(Instant::now() + Duration::from_secs(5)).unwrap();
            }
        }
    }
}
