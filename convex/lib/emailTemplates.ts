/**
 * Email templates for Fretbox Outreach AI.
 * Each template returns both a plain-text `body` (fallback) and an `html` version.
 */

// ─── Shared HTML helpers ─────────────────────────────────────────────────────

const BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 15px;
  line-height: 1.7;
  color: #1a1a1a;
  background-color: #ffffff;
  margin: 0;
  padding: 0;
`;

const htmlWrap = (content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fretbox</title>
</head>
<body style="${BASE_STYLES}">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <!-- Logo bar -->
    <div style="margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">
      <span style="font-size:18px;font-weight:700;color:#111827;letter-spacing:-0.02em;">
        🎸 Fretbox
        <span style="color:#3b82f6;">AI</span>
      </span>
    </div>

    <!-- Body -->
    <div style="color:#374151;">
      ${content}
    </div>

    <!-- Footer -->
    <div style="margin-top:40px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      <p style="margin:0 0 4px 0;"><strong style="color:#6b7280;">Ashish Gupta</strong></p>
      <p style="margin:0 0 4px 0;">Founder, Fretbox</p>
      <p style="margin:0;">
        <a href="mailto:ashish@fretbox.in" style="color:#3b82f6;text-decoration:none;">ashish@fretbox.in</a>
        &nbsp;·&nbsp;
        <a href="https://fretbox.in" style="color:#3b82f6;text-decoration:none;">fretbox.in</a>
      </p>
      <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;">
        You're receiving this because we believe Fretbox can help your institution.
        To opt out, simply reply with "unsubscribe".
      </p>
    </div>
  </div>
</body>
</html>`;

const p = (text: string, style = "") =>
  `<p style="margin:0 0 16px 0;${style}">${text}</p>`;

const strong = (text: string) =>
  `<strong style="color:#111827;">${text}</strong>`;

const bullet = (items: string[]) => `
<ul style="margin:0 0 20px 0;padding-left:20px;color:#374151;">
  ${items.map((i) => `<li style="margin-bottom:8px;">${i}</li>`).join("")}
</ul>`;

const ctaButton = (href: string, label: string) =>
  `<div style="margin:28px 0;">
    <a href="${href}" style="display:inline-block;background:#3b82f6;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;letter-spacing:0.01em;">${label} →</a>
  </div>`;

const divider = () =>
  `<div style="border-top:1px solid #e5e7eb;margin:24px 0;"></div>`;

// ─── Templates ───────────────────────────────────────────────────────────────

export const TEMPLATES = {
  // 1. Initial Outreach
  STEP_1: (name: string, uniName: string, personalizedOpener: string) => ({
    subject: `Partnership Inquiry: Fretbox x ${uniName}`,
    body: `
Dear ${name},

${personalizedOpener}

I am reaching out from Fretbox. We provide a state-of-the-art campus management and student engagement platform specifically tailored for leading Indian institutions like ${uniName}.

Our platform helps universities:
- Automate administrative workflows
- Enhance student hostel & facility management
- Improve real-time communication between campus stakeholders

I'd love to show you how Fretbox can add value to your institution. Do you have 10 minutes for a brief introductory call later this week?

Best regards,

Ashish Gupta
Founder, Fretbox
    `.trim(),
    html: htmlWrap(`
      ${p(`Dear ${strong(name)},`)}
      ${p(personalizedOpener)}
      ${p(`I'm reaching out from <strong style="color:#111827;">Fretbox</strong> — a campus management and student engagement platform built specifically for leading Indian universities like ${strong(uniName)}.`)}
      ${p("Our platform helps institutions:")}
      ${bullet([
        "Automate administrative workflows and reduce manual overhead",
        "Streamline student hostel &amp; facility management",
        "Improve real-time communication between campus stakeholders",
        "Drive better student outcomes through data-driven insights",
      ])}
      ${p("I'd love to show you how Fretbox can create real value for " + strong(uniName) + '. Would you have <strong style="color:#111827;">10 minutes</strong> for a quick introductory call this week?')}
      ${ctaButton("https://calendly.com/fretbox-demo", "Book a 10-min Call")}
      ${divider()}
      ${p("Best regards,", "margin-bottom:4px;")}
      ${p(`${strong("Ashish Gupta")}<br/><span style="color:#6b7280;font-size:13px;">Founder, Fretbox</span>`)}
    `),
  }),

  // 2. Follow-up 1 (4 days later)
  STEP_2: (name: string, uniName: string) => ({
    subject: `Following up: Transforming ${uniName}'s campus experience`,
    body: `
Hi ${name},

I wanted to follow up on my previous email. I understand you're busy, but I genuinely believe Fretbox's digital-first approach to campus management could be a game-changer for ${uniName}.

We've recently helped several institutions reduce administrative overhead by up to 30%.

Would you be open to a quick demo next Tuesday or Wednesday?

Best,

Ashish Gupta
Founder, Fretbox
    `.trim(),
    html: htmlWrap(`
      ${p(`Hi ${strong(name)},`)}
      ${p(`I wanted to follow up on my earlier email. I know your schedule is demanding, but I genuinely believe Fretbox's digital-first approach to campus operations could make a meaningful difference for ${strong(uniName)}.`)}
      <div style="background:#f0fdf4;border-left:3px solid #22c55e;border-radius:4px;padding:14px 18px;margin:0 0 20px 0;">
        <p style="margin:0;font-size:14px;color:#15803d;font-weight:600;">📊 Results from similar institutions:</p>
        <p style="margin:6px 0 0;font-size:14px;color:#166534;">Up to <strong>30% reduction</strong> in administrative overhead within the first semester.</p>
      </div>
      ${p(`Would you be open to a <strong style="color:#111827;">15-minute demo</strong> next Tuesday or Wednesday? I can walk you through exactly how Fretbox would work for ${uniName}.`)}
      ${ctaButton("https://calendly.com/fretbox-demo", "Pick a Time")}
      ${divider()}
      ${p("Best,", "margin-bottom:4px;")}
      ${p(`${strong("Ashish Gupta")}<br/><span style="color:#6b7280;font-size:13px;">Founder, Fretbox</span>`)}
    `),
  }),

  // 3. Follow-up 2 (Value Add - 7 days later)
  STEP_3: (name: string, newsSignal: string) => ({
    subject: `Digital transformation at your fingertips`,
    body: `
Hi ${name},

I saw that ${newsSignal} — that's fantastic progress.

As institutions grow and evolve, digital infrastructure becomes the backbone of student success. Fretbox is designed to handle this scale seamlessly.

I've attached a brief overview of our modules. Let me know if you'd like to discuss how we can customize Fretbox for your specific needs.

Cheers,

Ashish Gupta
Founder, Fretbox
    `.trim(),
    html: htmlWrap(`
      ${p(`Hi ${strong(name)},`)}
      ${p(`I saw that <em style="color:#374151;">${newsSignal}</em> — that's a great milestone!`)}
      ${p("As institutions grow, the right digital backbone becomes critical to student success. Fretbox is built to scale with you:")}
      ${bullet([
        '<strong style="color:#111827;">Hostel &amp; Facility Management</strong> — real-time occupancy, maintenance, and communication',
        '<strong style="color:#111827;">Administrative Automation</strong> — reduce manual processes by 30%+',
        '<strong style="color:#111827;">Student Engagement</strong> — digital-first communication channels',
        '<strong style="color:#111827;">Actionable Analytics</strong> — data-driven decisions for leadership',
      ])}
      ${p("I'd love to walk you through a customized demo tailored to your institution's specific needs.")}
      ${ctaButton("https://calendly.com/fretbox-demo", "Schedule a Custom Demo")}
      ${divider()}
      ${p("Cheers,", "margin-bottom:4px;")}
      ${p(`${strong("Ashish Gupta")}<br/><span style="color:#6b7280;font-size:13px;">Founder, Fretbox</span>`)}
    `),
  }),

  // 4. Break-up / Final Follow-up (10 days later)
  STEP_4: (name: string) => ({
    subject: `One last check-in`,
    body: `
Hi ${name},

I'm reaching out one last time regarding Fretbox. If now isn't the right time to explore a new campus management solution, I completely understand.

I'll stop my outreach for now, but if you're ever looking to digitize your campus operations in the future, please don't hesitate to reach out.

Wishing you the best,

Ashish Gupta
Founder, Fretbox
    `.trim(),
    html: htmlWrap(`
      ${p(`Hi ${strong(name)},`)}
      ${p("This will be my last email — I completely understand if the timing isn't right for exploring a new platform.")}
      ${p("Whenever the time is right to digitize your campus operations, Fretbox will be here. We're building this specifically for forward-thinking Indian institutions.")}
      <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:0 0 20px 0;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600;">WHEN YOU'RE READY</p>
        <p style="margin:0;font-size:14px;color:#374151;">
          <a href="https://calendly.com/fretbox-demo" style="color:#3b82f6;text-decoration:none;font-weight:600;">Book a call</a> or reply to this email anytime.
        </p>
      </div>
      ${p("Wishing you and your team continued success.", "color:#374151;")}
      ${divider()}
      ${p("Warmly,", "margin-bottom:4px;")}
      ${p(`${strong("Ashish Gupta")}<br/><span style="color:#6b7280;font-size:13px;">Founder, Fretbox</span>`)}
    `),
  }),

  // 5. Auto-Reply: Positive Interest / More Info
  POSITIVE_INTEREST: (name: string, uniName: string, meetLink?: string) => {
    const ctaText = meetLink
      ? `You can join the meeting here: ${meetLink}`
      : "Would you like to schedule a 15-minute demo to see the platform in action? Simply reply to this email with a few times that work for you.";
    const ctaLabel = meetLink ? "Join Google Meet →" : "Book a 15-min Demo";
    const ctaHref = meetLink ?? "https://fretbox.in/book";
    return {
      subject: `Deep dive: Fretbox x ${uniName}`,
      body: `
Hi ${name},

I'm glad to hear you're interested in learning more about how Fretbox can help ${uniName}.

I've attached a detailed brochure that covers our core modules: Hostel Management, Digital Security, and Student Engagement.

${ctaText}

Best regards,

Ashish Gupta
Founder, Fretbox
    `.trim(),
      html: htmlWrap(`
      ${p(`Hi ${strong(name)},`)}
      ${p(`Glad to hear you're interested! Here's a quick overview of what Fretbox can do for ${strong(uniName)}:`)}
      ${bullet([
        '<strong style="color:#111827;">Hostel Management</strong> — room allocation, visitor tracking, warden dashboards',
        '<strong style="color:#111827;">Facility Operations</strong> — maintenance requests, asset tracking, vendor management',
        '<strong style="color:#111827;">Student Engagement</strong> — digital notice boards, event management, feedback loops',
        '<strong style="color:#111827;">Admin Automation</strong> — fee management, attendance, compliance reporting',
      ])}
      ${p(`I'd love to walk you through a <strong style="color:#111827;">live demo</strong> customized specifically for ${strong(uniName)}.`)}
      ${
        meetLink
          ? p(
              `Join the call here: <a href="${meetLink}" style="color:#3b82f6;text-decoration:none;font-weight:600;">${meetLink}</a>`,
            )
          : p(
              "Simply reply to this email with a few times that work for you and I will send over a calendar invite.",
            )
      }
      ${ctaButton(ctaHref, ctaLabel)}
      ${divider()}
      ${p("Best regards,", "margin-bottom:4px;")}
      ${p(`${strong("Ashish Gupta")}<br/><span style="color:#6b7280;font-size:13px;">Founder, Fretbox</span>`)}
    `),
    };
  },

  // 6. Auto-Reply: Meeting Request Acknowledgement
  MEETING_REQUEST_ACK: (name: string, uniName: string, meetLink?: string) => {
    const ctaText = meetLink
      ? `Your meeting is confirmed. Join here: ${meetLink}`
      : "To make our time most productive, feel free to book a specific slot that works for you.";
    const ctaLabel = meetLink ? "Join Google Meet →" : "Confirm Your Slot →";
    const ctaHref = meetLink ?? "https://fretbox.in/book";
    return {
      subject: `Let's connect: Fretbox x ${uniName}`,
      body: `
Hi ${name},

Looking forward to our call! I've received your request for a demo/meeting.

${ctaText}

I'll also prepare a custom walkthrough based on ${uniName}'s specific needs.

See you soon,

Ashish Gupta
Founder, Fretbox
    `.trim(),
      html: htmlWrap(`
      ${p(`Hi ${strong(name)},`)}
      <div style="background:#ecfdf5;border-left:3px solid #10b981;border-radius:4px;padding:14px 18px;margin:0 0 24px 0;">
        <p style="margin:0;font-size:15px;color:#065f46;font-weight:600;">🎉 Meeting request received!</p>
        <p style="margin:6px 0 0;font-size:14px;color:#047857;">I'm excited to connect with you and the ${uniName} team.</p>
      </div>
      ${p(ctaText)}
      ${
        meetLink
          ? p(
              `<a href="${meetLink}" style="color:#3b82f6;text-decoration:none;font-weight:600;">${meetLink}</a>`,
            )
          : ""
      }
      ${ctaButton(ctaHref, ctaLabel)}
      ${p('Before our call, I\'ll prepare a <strong style="color:#111827;">custom walkthrough</strong> tailored specifically to the needs and scale of ' + strong(uniName) + " — so we can make the most of every minute.")}
      ${divider()}
      ${p("See you soon,", "margin-bottom:4px;")}
      ${p(`${strong("Ashish Gupta")}<br/><span style="color:#6b7280;font-size:13px;">Founder, Fretbox</span>`)}
    `),
    };
  },
};
