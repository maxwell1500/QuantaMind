# Tier Task Schema (v2) — extends the Phase 6/9 contract

Top-level:
  name, domain, tier (Easy|Medium|Hard|Extreme), pass_k, axes{...},
  generated (bool — true if Hard/Extreme procedural), tasks[]

axes: min_required_steps, decoy_tools, hidden_prereqs, conflicting_constraints,
      adversarial_context (bool), region_variance (bool — the "every state different" chaos)

task:
  id, category, max_steps, max_recovery, prompt,
  world_state{}        — the ground-truth the oracle knows; the model must DISCOVER it via tools
  tools[]              — {name, params}
  decoy_tools[]        — plausible-but-wrong {name, params}
  expected_calls[]     — type-tagged: {type:call,name,args} | {type:parallel,calls[]} | {type:none}
  must_not_call[]      — names or {name,args} that auto-fail end-state if invoked (the trap)
  faults[]             — {on_call, type:transient|persistent, status_code, clears_after}
  trap                 — {note} explaining why naive/one-rule-fits-all fails
  rubric               — {success_definition, partial_credit:false} (end-state only)

Hybrid generation (Hard/Extreme): `generated:true` + a worked example instance in tasks[],
plus `generator{template_id, seed_from[], randomize[]}` describing what instantiate() varies.
