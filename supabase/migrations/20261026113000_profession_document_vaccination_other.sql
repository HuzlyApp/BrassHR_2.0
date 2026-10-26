-- Profession upload documents can be a vaccination record or another file type.

ALTER TABLE public.tenant_profession_documents
  DROP CONSTRAINT IF EXISTS tenant_profession_documents_kind_chk;

ALTER TABLE public.tenant_profession_documents
  ADD CONSTRAINT tenant_profession_documents_kind_chk
  CHECK (document_kind IN ('certificate', 'license', 'vaccination', 'other'));
