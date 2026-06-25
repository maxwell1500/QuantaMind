use crate::commands::publish::cohort::cohort_key;
use crate::commands::publish::publish_cmd::{BUILD_HASH, ENGINE_VERSION};
use crate::commands::system::hardware::snapshot;
use crate::errors::AppError;
use crate::inference::eval::agentic::spec::Tier;
use crate::inference::eval::readiness::hardware::hwclass::{classify_bytes, default_required_tier};
use crate::inference::eval::readiness::types::ModelVerdict;
use crate::inference::eval::toolcall::tasks::builtin_collection;
use crate::persistence::prompts::schema::InferenceParams;
use crate::persistence::publish::canonical::{canonical_hash, canonical_json};
use crate::persistence::publish::row::{PublishContext, PublishRow};
use crate::persistence::publish::validate::pre_validate;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize)]
pub struct InvalidRow {
    pub index: usize,
    pub reason: String,
}

/// Everything the privacy-gate dialog needs to show EXACTLY what would be sent:
/// the projected rows, the deterministic canonical JSON + its hash, the derived
/// cohort, how many models were dropped as unmeasured, and any local validation
/// failure. No network — this only builds the preview (the POST is B3).
#[derive(Serialize)]
pub struct PublishPreview {
    pub rows: Vec<PublishRow>,
    pub canonical_json: String,
    pub hash: String,
    pub cohort_key: String,
    pub excluded_count: usize,
    pub invalid: Option<InvalidRow>,
}

/// Build the publish payload preview from the current verdicts. The run-wide
/// context (cohort + hardware class derived from the authoritative LOCAL hardware
/// snapshot, never a frontend value; the active collection's identity + content
/// hash; build provenance) is assembled here, then each measured built-in-collection
/// verdict is projected by allowlist (unmeasured/unquantized/custom-collection rows
/// dropped → `excluded_count`), and the same pre-validation the server runs is
/// applied. Read-only and offline.
///
/// NOTE: this command (with auth/send) compiles OUT of enterprise builds once the
/// `enterprise` feature gate lands in B1; export stays in.
#[tauri::command]
pub fn preview_publish_payload(
    verdicts: Vec<ModelVerdict>,
    params: InferenceParams,
    collection_id: String,
    collection_hash: Option<String>,
) -> Result<PublishPreview, AppError> {
    build_preview(&verdicts, &publish_context(&collection_id, params, collection_hash))
}

/// Assemble the batch's run-wide [`PublishContext`] from the local hardware snapshot, the active
/// collection id, and the RUN-VERIFIED `collection_hash` (computed at run time in `batch_cmd` and
/// carried on the report). `None` for a custom/imported collection OR any edit — the signal
/// `project` uses to exclude non-publishable results. The hash is the SINGLE source of truth: this
/// never re-derives it from `collection_id` (that would let an edited collection publish under the
/// real bundled identity). `collection_id` is still used for the display name + per-tier decoys.
pub(crate) fn publish_context(collection_id: &str, params: InferenceParams, collection_hash: Option<String>) -> PublishContext {
    let hw = snapshot();
    let hardware_class = classify_bytes(hw.total_memory_bytes);
    PublishContext {
        params,
        cohort_key: cohort_key(&hw),
        engine_version: ENGINE_VERSION.to_string(),
        build_hash: BUILD_HASH.to_string(),
        collection_name: collection_id.to_string(),
        collection_hash,
        decoys_by_tier: decoys_by_tier(collection_id),
        hardware_class,
        recommended_tier: default_required_tier(hardware_class),
    }
}

/// The decoy-tool count each tier presented, from the built-in collection's task
/// axes (mirrors the Agent Report's `axesByTier`): the max `decoy_tools` among a
/// tier's tasks. Empty for a non-built-in collection or one declaring no axes — a
/// tier then publishes `decoy_count: None`, never a fabricated number.
fn decoys_by_tier(collection_id: &str) -> BTreeMap<Tier, u32> {
    let mut out: BTreeMap<Tier, u32> = BTreeMap::new();
    for task in builtin_collection(collection_id).into_iter().flatten() {
        if let Some(spec) = &task.agentic {
            if let Some(axes) = &spec.axes {
                let e = out.entry(spec.tier).or_insert(0);
                *e = (*e).max(axes.decoy_tools);
            }
        }
    }
    out
}

/// The pure core (no `snapshot()`/Tauri) so the projection + canonicalization are
/// testable with a fixed context. Shared with `publish_cmd` so the previewed payload
/// is byte-identical to the one sent.
pub(crate) fn build_preview(verdicts: &[ModelVerdict], ctx: &PublishContext) -> Result<PublishPreview, AppError> {
    let rows: Vec<PublishRow> = verdicts.iter().filter_map(|v| PublishRow::project(v, ctx)).collect();
    let excluded_count = verdicts.len() - rows.len();
    let invalid = pre_validate(&rows).err().map(|(index, reason)| InvalidRow { index, reason });
    Ok(PublishPreview {
        canonical_json: canonical_json(&rows)?,
        hash: canonical_hash(&rows)?,
        cohort_key: ctx.cohort_key.clone(),
        excluded_count,
        invalid,
        rows,
    })
}

#[cfg(test)]
#[path = "preview_cmd_tests.rs"]
mod tests;
