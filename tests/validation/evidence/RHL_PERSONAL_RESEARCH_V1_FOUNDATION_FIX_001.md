# Personal Research v1 foundation fix validation

Real-network smoke executed on 2026-09-08 against CNINFO, GDELT, and AKShare adapters.

- `600519 -> 000858 -> 600519` completed on one fresh Schema 0.4 / Storage 1 Knowledge Base.
- Revisions were `0 -> 1 -> 2 -> 2`; the repeated `600519` run added no canonical objects.
- Final canonical counts were 2 entities, 1 shared structured-data Source, and 2 Claims.
- Raw archive integrity passed for the committed Source evidence.
- The live environment returned only an AKShare structured-data Source; CNINFO/GDELT availability remains an environment/provider risk.
- Evidence is sanitized: no source body, absolute path, credential, or runtime-private detail is committed.
