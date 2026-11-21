---
title: Payment flow
description: The services that take part in one payment.
---

```mermaid
flowchart LR
  classDef service fill:#f8fafc,stroke:#475569
  Checkout --> Authorize --> Capture --> Notify
  class Authorize,Capture,Notify service
```

Each service returns a result that the next one reads.
