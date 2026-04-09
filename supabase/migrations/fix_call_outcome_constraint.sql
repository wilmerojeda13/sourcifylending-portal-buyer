-- Fix the crm_calls call_outcome constraint to include all valid outcomes
ALTER TABLE public.crm_calls
DROP CONSTRAINT IF EXISTS crm_calls_outcome_check;

ALTER TABLE public.crm_calls
ADD CONSTRAINT crm_calls_outcome_check
CHECK (call_outcome in (
    'No Answer',
    'Voicemail',
    'Left Voicemail',
    'Busy',
    'Bad Number',
    'Not Interested',
    'Do Not Call',
    'Call Back',
    'Call Back Later',
    'Follow Up',
    'Interested',
    'Appointment Set',
    'Booked Call',
    'Closed Won',
    'Closed Lost'
));
