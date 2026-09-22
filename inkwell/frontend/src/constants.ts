import type { FieldType } from "@inkwell/shared";

export const COLORS = [
    "#0f9d6b",
    "#2563eb",
    "#c2410c",
    "#7c3aed",
    "#0891b2",
    "#be185d",
    "#4d7c0f",
    "#b45309"
];

export const DEFAULTS: Record<FieldType, { w: number; h: number; label: string }> = {
    signature: { w: 190, h: 52, label: "Signature" },
    initials: { w: 74, h: 44, label: "Initials" },
    name: { w: 190, h: 38, label: "Full name" },
    date: { w: 140, h: 38, label: "Date" },
    text: { w: 190, h: 38, label: "Text" },
    check: { w: 30, h: 30, label: "Checkbox" }
};

export const PAGE_HTML = [
    `<h3>Agreement</h3><div class="sub">Prepared with InkWell · demo document</div>
   <p><span class="cl">1. Purpose.</span> This Agreement records the terms accepted by the parties who sign below. It is presented for electronic signature and may be completed by each signer from their own device.</p>
   <p><span class="cl">2. Scope.</span> The obligations, deliverables, dates, and any amounts are those set out in the body of this document and any attached schedules.</p>
   <p><span class="cl">3. Term.</span> This Agreement takes effect on the date the final signature is applied and remains in force until the obligations described herein are fulfilled.</p>
   <p><span class="cl">4. Representations.</span> Each party represents that the person signing is authorised to bind that party and has reviewed the terms in full.</p>
   <p><span class="cl">5. Electronic Records.</span> The parties agree that this Agreement may be signed electronically and that electronic signatures are valid and binding to the same extent as handwritten ones.</p>
   <p><span class="cl">6. Counterparts.</span> This Agreement may be executed in counterparts, each of which is deemed an original, and together constitute one instrument.</p>`,
    `<p><span class="cl">7. Governing Law.</span> This Agreement is governed by the applicable laws of the parties' jurisdiction and constitutes the entire agreement between them.</p>
   <p><span class="cl">8. Acknowledgement.</span> By signing below, each party acknowledges they have read, understood, and agree to be bound by this Agreement, and consent to signing electronically.</p>
   <div class="sighead">Signatures</div>
   <p style="color:#98a2b3;font-size:11.5px">The sender places a signature block for each signer anywhere in this area. Each signer completes only their own fields.</p>`
];
