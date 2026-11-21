"use client";

import { Scale } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminDisputesPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <p>
            Disputes (chargebacks, refund disagreements, no-show conflicts) are triaged here. The
            foundation is in place: refunds carry status + reason, the audit log records who decided
            what, and payment events keep the raw gateway payloads as evidence.
          </p>
          <p className="mt-2">
            Dispute workflow (case states, assignment, resolution notes) is the next milestone —
            deliberately not faked here.
          </p>
        </CardContent>
      </Card>
      <EmptyState
        icon={<Scale className="h-6 w-6" />}
        title="No open disputes"
        description="When a payment is disputed it will appear here with its evidence trail."
      />
    </div>
  );
}
