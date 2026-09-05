# AI Knowledge v1.18.1

AI Knowledge is a private, tenant/platform-scoped source for the CS Assistant. It is intentionally separate from the public Guide FAQ module.

## Admin surface

The Admin form contains only Question, Type, Answer, and Enabled. Type is stored using the existing knowledge keyword field, so no destructive database migration is required.

## Runtime

The compiled Assistant Setup remains capped at 24,000 characters. AI Knowledge is retrieved separately at request time. The backend searches up to 500 active entries for the current tenant/platform, ranks them against the customer message, and supplies only the top three matches. Each selected answer is clipped to 4,500 characters before prompt composition.

Menu & Images remains a separate approved media source and continues to own response images/buttons. Guide-page FAQs are unchanged.

## Safety

- tenant/platform isolation is preserved;
- inactive entries are never routed;
- the existing retired AI Q&A/import/router modules remain retired;
- only the simple /admin/knowledge CRUD route is restored;
- no SQL migration is introduced;
- the 24k Assistant Setup compiler limit is unchanged.
