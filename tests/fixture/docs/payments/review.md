---
title: Review of the capture service
description: Findings from the review of the capture service.
---

The service captures an authorized payment.

```ruby
class Capture
  LIMIT_CENTS = 500_000

  def call(payment)
    return :skipped if payment.captured?

    payment.update!(status: 'captured', captured_at: Time.current)
  end
end
```
