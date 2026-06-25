//! Live OCR run: build the vision `GenerateSpec` (image + extraction prompt), call the model, then
//! classify + score. The modality gate is the caller's job (a non-vision model gets `cannot_process`
//! and never reaches `score_one`). Status precedence: CannotProcess (gate) → EmptyOutput →
//! Hallucinated → Scored.

use crate::errors::AppResult;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::vision::ocr_score::{is_hallucinated, score_ocr, OcrMetrics};
use crate::inference::eval::vision::report::{VisionReportRow, VisionStatus};
use crate::inference::eval::vision::spec::VisionTask;
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_spec::GenerateSpec;

const OCR_SYSTEM: &str = "You are an OCR engine. Transcribe ALL visible text in the image exactly, preserving reading order. Output ONLY the transcribed text — no commentary, no markdown.";
const DEFAULT_PROMPT: &str = "Extract all text from this image.";

/// Score one OCR task LIVE: image → model → text → score. The caller passed the modality gate.
pub async fn score_one<M: ModelTurn>(turn: &M, model: &str, task: &VisionTask, image_b64: String) -> AppResult<VisionReportRow> {
    let prompt = task.prompt.clone().unwrap_or_else(|| DEFAULT_PROMPT.to_string());
    let spec = GenerateSpec {
        model: model.to_string(),
        prompt,
        system: Some(OCR_SYSTEM.to_string()),
        options: Some(GenerateOptions { temperature: Some(0.0), ..Default::default() }),
        keep_alive: None,
        images: Some(vec![image_b64.clone()]),
    };
    let extracted = turn.run(&spec).await.map(|(t, _)| t).unwrap_or_default();
    Ok(classify(model, task, extracted, image_b64))
}

/// Classify + score an extraction. Empty checked BEFORE scoring (empty is never a fake 0% nor
/// Hallucinated); otherwise Scored, or Hallucinated when invented content is detected.
pub fn classify(model: &str, task: &VisionTask, extracted: String, image_b64: String) -> VisionReportRow {
    if extracted.trim().is_empty() {
        return row(model, task, VisionStatus::EmptyOutput, None, extracted, image_b64);
    }
    let m = score_ocr(&task.ground_truth, &extracted, &task.critical_tokens);
    let status = if is_hallucinated(&m) { VisionStatus::Hallucinated } else { VisionStatus::Scored };
    row(model, task, status, Some(m), extracted, image_b64)
}

/// The modality-gate outcome: the model can't do vision → CannotProcess (no call, no fabricated 0).
pub fn cannot_process(model: &str, task: &VisionTask, image_b64: String) -> VisionReportRow {
    row(model, task, VisionStatus::CannotProcess, None, String::new(), image_b64)
}

fn row(model: &str, task: &VisionTask, status: VisionStatus, metrics: Option<OcrMetrics>, extracted: String, image_b64: String) -> VisionReportRow {
    VisionReportRow {
        task_id: task.id.clone(),
        model: model.to_string(),
        status,
        metrics,
        extracted,
        ground_truth: task.ground_truth.clone(),
        image_b64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task() -> VisionTask {
        VisionTask { id: "t".into(), prompt: None, image: "img".into(), ground_truth: "total is forty two dollars".into(), critical_tokens: vec![] }
    }

    #[test]
    fn oracle_extraction_scores_zero_and_is_scored() {
        let r = classify("m", &task(), "total is forty two dollars".into(), "B64".into());
        assert_eq!(r.status, VisionStatus::Scored);
        let m = r.metrics.unwrap();
        assert_eq!(m.cer, 0.0);
        assert_eq!(m.wer, 0.0);
    }

    #[test]
    fn empty_output_is_its_own_status_not_a_zero_score() {
        let r = classify("m", &task(), "   ".into(), "B64".into());
        assert_eq!(r.status, VisionStatus::EmptyOutput);
        assert!(r.metrics.is_none());
    }

    #[test]
    fn invented_content_is_hallucinated_status() {
        let r = classify("m", &task(), "total is forty two dollars and a free gift included".into(), "B64".into());
        assert_eq!(r.status, VisionStatus::Hallucinated);
    }

    #[test]
    fn cannot_process_is_a_status_with_no_metrics_and_no_call() {
        let r = cannot_process("text-only-model", &task(), "B64".into());
        assert_eq!(r.status, VisionStatus::CannotProcess);
        assert!(r.metrics.is_none());
        assert!(r.extracted.is_empty());
    }
}
