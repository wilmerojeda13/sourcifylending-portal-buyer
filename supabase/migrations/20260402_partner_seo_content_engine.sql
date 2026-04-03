alter table public.seo_content_pages
  drop constraint if exists seo_content_pages_route_group_check,
  drop constraint if exists seo_content_pages_content_type_check;

alter table public.seo_content_pages
  add constraint seo_content_pages_route_group_check
  check (
    route_group in (
      'services',
      'industries',
      'answers',
      'comparisons',
      'locations',
      'portal-guides',
      'problems',
      'partners',
      'partner-personas',
      'partner-earnings',
      'partner-guides',
      'partner-comparisons',
      'partner-faqs',
      'partner-case-studies'
    )
  ),
  add constraint seo_content_pages_content_type_check
  check (
    content_type in (
      'service_page',
      'industry_page',
      'answer_page',
      'comparison_page',
      'local_page',
      'portal_guide_page',
      'problem_page',
      'partner_program_page',
      'partner_persona_page',
      'partner_earnings_page',
      'partner_guide_page',
      'partner_comparison_page',
      'partner_faq_page',
      'partner_case_study_page'
    )
  );

alter table public.seo_content_topic_ideas
  drop constraint if exists seo_content_topic_ideas_suggested_content_type_check;

alter table public.seo_content_topic_ideas
  add constraint seo_content_topic_ideas_suggested_content_type_check
  check (
    suggested_content_type in (
      'service_page',
      'industry_page',
      'answer_page',
      'comparison_page',
      'local_page',
      'portal_guide_page',
      'problem_page',
      'partner_program_page',
      'partner_persona_page',
      'partner_earnings_page',
      'partner_guide_page',
      'partner_comparison_page',
      'partner_faq_page',
      'partner_case_study_page'
    )
  );

alter table public.seo_content_events
  drop constraint if exists seo_content_events_event_type_check;

alter table public.seo_content_events
  add constraint seo_content_events_event_type_check
  check (
    event_type in (
      'visit',
      'lead',
      'signup',
      'booked_call',
      'paid_client',
      'indexnow_submission',
      'ai_citation',
      'partner_application',
      'partner_approved',
      'partner_active',
      'partner_generated_signup',
      'partner_generated_paid_client'
    )
  );

notify pgrst, 'reload schema';
