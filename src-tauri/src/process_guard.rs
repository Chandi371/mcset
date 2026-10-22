//! Process lifecycle and Windows Job Object guard.
//! Ensures that spawned child processes (Java Minecraft servers and Portal tunnel)
//! are automatically and unconditionally terminated by the OS if the parent
//! application exits or is terminated.

#[cfg(target_os = "windows")]
pub mod windows_job {
    use std::ffi::c_void;
    use std::os::windows::io::RawHandle;
    use std::sync::OnceLock;

    type HANDLE = *mut c_void;
    type BOOL = i32;

    #[repr(C)]
    #[allow(non_snake_case)]
    struct IO_COUNTERS {
        ReadOperationCount: u64,
        WriteOperationCount: u64,
        OtherOperationCount: u64,
        ReadTransferCount: u64,
        WriteTransferCount: u64,
        OtherTransferCount: u64,
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        PerProcessUserTimeLimit: i64,
        PerJobUserTimeLimit: i64,
        LimitFlags: u32,
        MinimumWorkingSetSize: usize,
        MaximumWorkingSetSize: usize,
        ActiveProcessLimit: u32,
        Affinity: usize,
        PriorityClass: u32,
        SchedulingClass: u32,
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION,
        IoInfo: IO_COUNTERS,
        ProcessMemoryLimit: usize,
        JobMemoryLimit: usize,
        PeakProcessMemoryLimit: usize,
        PeakJobMemoryLimit: usize,
    }

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: u32 = 9;

    unsafe extern "system" {
        fn CreateJobObjectW(lpJobAttributes: *const c_void, lpName: *const u16) -> HANDLE;
        fn SetInformationJobObject(
            hJob: HANDLE,
            JobObjectInformationClass: u32,
            lpJobObjectInformation: *const c_void,
            cbJobObjectInformationLength: u32,
        ) -> BOOL;
        fn AssignProcessToJobObject(hJob: HANDLE, hProcess: HANDLE) -> BOOL;
    }

    struct JobHandle(HANDLE);
    unsafe impl Send for JobHandle {}
    unsafe impl Sync for JobHandle {}

    static GLOBAL_JOB: OnceLock<JobHandle> = OnceLock::new();

    fn get_job_handle() -> Option<HANDLE> {
        let job_ref = GLOBAL_JOB.get_or_init(|| unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                log::error!("[ProcessGuard] Failed to create Windows Job Object");
                return JobHandle(std::ptr::null_mut());
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            let res = SetInformationJobObject(
                job,
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                &info as *const _ as *const c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            if res == 0 {
                log::error!("[ProcessGuard] Failed to set KILL_ON_JOB_CLOSE on Windows Job Object");
            } else {
                log::info!("[ProcessGuard] Initialized Windows Job Object with KILL_ON_JOB_CLOSE");
            }

            JobHandle(job)
        });

        if job_ref.0.is_null() {
            None
        } else {
            Some(job_ref.0)
        }
    }

    pub fn assign_to_job(handle: RawHandle) {
        if let Some(job) = get_job_handle() {
            unsafe {
                let res = AssignProcessToJobObject(job, handle as HANDLE);
                if res != 0 {
                    log::info!("[ProcessGuard] Bound child process to Windows Job Object");
                } else {
                    log::warn!("[ProcessGuard] Failed to bind child process to Windows Job Object");
                }
            }
        }
    }
}

/// Attach a child process to OS-level automatic termination guards
#[cfg(target_os = "windows")]
pub fn guard_child_process<T: std::os::windows::io::AsRawHandle>(child: &T) {
    windows_job::assign_to_job(child.as_raw_handle());
}

#[cfg(not(target_os = "windows"))]
pub fn guard_child_process<T>(_child: &T) {
    // Non-Windows platforms rely on Unix signal handlers and parent death hooks
}
