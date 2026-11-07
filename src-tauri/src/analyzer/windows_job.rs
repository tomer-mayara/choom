use process_wrap::std::ChildWrapper;
use std::{
    io,
    mem::size_of,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
};
use windows::{
    Win32::{
        Foundation::{ERROR_NO_MORE_FILES, HANDLE},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, TH32CS_SNAPTHREAD, THREADENTRY32, Thread32First,
                Thread32Next,
            },
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JobObjectBasicAccountingInformation, JobObjectExtendedLimitInformation,
                QueryInformationJobObject, SetInformationJobObject, TerminateJobObject,
            },
            Threading::{OpenThread, ResumeThread, THREAD_SUSPEND_RESUME},
        },
    },
    core::HRESULT,
};

/// Owns a kill-on-close job whose membership can be observed after its leader exits.
pub(crate) struct WindowsJob {
    handle: OwnedHandle,
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
        let job = Self {
            handle: owned(unsafe { CreateJobObjectW(None, None) }.map_err(io::Error::other)?),
        };
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
        unsafe { AssignProcessToJobObject(job.raw(), HANDLE(process.as_raw_handle())) }
            .map_err(io::Error::other)?;
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

    pub fn stopped(&self) -> io::Result<bool> {
        let mut information = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
        // The query writes only into the supplied fixed-size accounting structure.
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
        Ok(information.ActiveProcesses == 0)
    }
}
