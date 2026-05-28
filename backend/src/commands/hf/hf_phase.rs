use crate::inference::create::create_spec::CreatePhase;
use serde::Serialize;

pub const EVENT_HF_PROGRESS: &str = "hf-progress";

#[derive(Serialize, Clone)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum HfPhase {
    Downloading { bytes_completed: u64, bytes_total: u64, speed_bps: u64 },
    Hashing { bytes_completed: u64, bytes_total: u64 },
    Uploading { bytes_completed: u64, bytes_total: u64 },
    Installing,
}

impl HfPhase {
    /// Map a local-create phase onto the HF install progress phase.
    pub fn from_create(phase: CreatePhase) -> Self {
        match phase {
            CreatePhase::Hashing { bytes_completed, bytes_total } => {
                HfPhase::Hashing { bytes_completed, bytes_total }
            }
            CreatePhase::Uploading { bytes_completed, bytes_total } => {
                HfPhase::Uploading { bytes_completed, bytes_total }
            }
            CreatePhase::Creating => HfPhase::Installing,
        }
    }
}
