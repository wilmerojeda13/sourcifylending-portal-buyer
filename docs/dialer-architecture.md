# Dialer Architecture

There is only one active dialer surface in this product.

## Canonical route

- `/admin/dialer/*`

## Removed route

- `/admin/crm/dialer/*`

## Rules

- Do not add new dialer UI under `/admin/crm/dialer/*`.
- All new dialer work belongs under `/admin/dialer/*`.
- Legacy `/admin/crm/dialer` URLs redirect to `/admin/dialer/campaigns`.

