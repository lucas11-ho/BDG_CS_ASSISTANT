BDG CS ASSISTANT — AI KNOWLEDGE v1.18.1
=======================================

PURPOSE
-------
Adds a NEW private AI Knowledge module without changing the existing /faq Guide-page module.

Admin UI stays simple:
  Question
  Type
  Answer
  Enabled

Runtime behavior:
- Assistant Setup remains the permanent behavior/instruction layer.
- Its existing 24,000-character compiled limit is NOT increased.
- AI Knowledge is stored separately.
- Up to 500 active knowledge records for the current tenant/platform are considered per turn.
- The existing server matcher ranks them against the customer's message.
- Only the top 3 relevant entries are inserted into the AI request.
- Each selected answer is bounded to 4,500 characters in runtime context.
- Menu & Images remains a separate source for approved media/buttons.
- Guide-page FAQs remain untouched.

SAFE INSTALL
------------
1. Make sure your local BDG_CS_ASSISTANT repository is current and has NO uncommitted changes.
2. Copy these four patch files into the repository ROOT (same level as backend-api and admin-pro).
3. Double-click START-AI-KNOWLEDGE-V1.18.1.bat.
4. The installer creates/checks out a LOCAL branch:
       feature/v1.18.1-ai-knowledge
5. It applies the patch and runs backend + Admin verification.
6. It DOES NOT commit or push automatically.
7. If SUCCESS is shown, review the diff and run:
       git add -A
       git commit -m "v1.18.1: add scoped AI Knowledge retrieval"
       git push -u origin feature/v1.18.1-ai-knowledge
8. Let GitHub CI pass before merging into main.

FILES CHANGED BY THE PATCH
--------------------------
backend-api/src/core.js
backend-api/src/server.js
backend-api/package.json
backend-api/scripts/v1.18.1-ai-knowledge-regression-test.js
admin-pro/src/routes/_admin.ai-knowledge.tsx
admin-pro/src/components/AdminLayout.tsx
.github/workflows/ci.yml
.github/workflows/bdg-production-release.yml
AI_KNOWLEDGE_V1.18.1.md

NO DATABASE MIGRATION
---------------------
The project already retains the scoped knowledge_items storage and CRUD helpers from the older architecture.
This patch safely reuses only that storage/API for the new simple AI Knowledge feature.
The older AI Q&A / knowledge-import / configurable router modules remain retired.

ROLLBACK BEFORE COMMIT
----------------------
If verification fails or you do not want the patch:
  git reset --hard main
  git checkout main
  git branch -D feature/v1.18.1-ai-knowledge

IMPORTANT
---------
Do not put passwords, OTPs, private keys, API keys, full banking credentials, or other secrets in AI Knowledge.
