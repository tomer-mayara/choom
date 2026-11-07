use std::{io, time::Instant};

pub(crate) fn stopped(group: u32, deadline: Instant) -> io::Result<bool> {
    // Signal zero observes only this process group; it does not send a signal.
    if unsafe { libc::kill(-(group as i32), 0) } == -1 {
        let error = io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ESRCH) {
            return Ok(true);
        }
        #[cfg(target_os = "macos")]
        if error.raw_os_error() == Some(libc::EPERM) {
            // A zombie-only Darwin group exists until its owner reaps it.
            // Keep waiting within the cleanup deadline, including real denial.
            return Ok(false);
        }
        return Err(error);
    }
    #[cfg(target_os = "linux")]
    {
        use std::io::Read;
        // Orphan zombies can outlive their work when PID 1 delays reaping them.
        // Do not change Choom's process-wide adoption policy to account for them.
        for entry in std::fs::read_dir("/proc")? {
            if Instant::now() >= deadline {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "group check expired",
                ));
            }
            let entry = entry?;
            if !entry
                .file_name()
                .as_encoded_bytes()
                .iter()
                .all(u8::is_ascii_digit)
            {
                continue;
            }
            let Some(pid) = entry
                .file_name()
                .to_str()
                .and_then(|name| name.parse::<i32>().ok())
            else {
                continue;
            };
            // Avoid opening unrelated process information on systems with restricted /proc.
            if unsafe { libc::getpgid(pid) } != group as i32 {
                continue;
            }
            let mut stat = String::new();
            match std::fs::File::open(entry.path().join("stat"))
                .and_then(|file| file.take(8192).read_to_string(&mut stat))
            {
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error),
            }
            let fields = stat
                .rsplit_once(')')
                .ok_or_else(|| io::Error::other("invalid process state"))?
                .1
                .split_whitespace()
                .take(3)
                .collect::<Vec<_>>();
            if fields.len() != 3 {
                return Err(io::Error::other("invalid process state"));
            }
            if fields[2].parse::<u32>().ok() == Some(group) && !matches!(fields[0], "Z" | "X") {
                return Ok(false);
            }
        }
        Ok(true)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = deadline;
        Ok(false)
    }
}
