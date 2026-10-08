// Lane 3 · Build lead row: EXACTLY the 28 LEADS columns of SPEC 2.4, in sheet order.
/*@include time*/
const S = $('Lane 3 · Settings to object').first().json;
const lead = $input.first().json;                           // comes out of the safety gate
const allowed = lead.gate_ok === true;
const stamp = nowTs();
return [{ json: {
  lead_id: lead.lead_id,
  created_at: stamp,
  source: 'waitlist_form',
  first_name: lead.first_name,
  email: lead.email,
  phone: lead.phone,
  city: lead.city,
  instagram_handle: lead.instagram_handle,
  interest: lead.interest,
  budget: lead.budget,
  occasion: lead.occasion,
  consent: lead.consent,
  email_allowed: allowed ? 'TRUE' : 'FALSE',
  score: lead.score,
  segment: lead.segment,
  score_reason: lead.score_reason,
  status: allowed ? 'new' : 'blocked',
  sequence_id: 'WAITLIST_NURTURE',
  seq_step: 0,
  next_action_at: allowed && lead.consent === 'TRUE' ? stamp : '',
  last_contacted_at: '',
  launch_step: 0,
  last_newsletter_id: '',
  thread_ids: '',
  last_reply_at: '',
  reply_class: '',
  notes: '',
  updated_at: stamp,
} }];
