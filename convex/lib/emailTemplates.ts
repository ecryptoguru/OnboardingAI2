/**
 * Email templates for Fretbox Outreach AI.
 * These are functions that return an object with subject and body.
 */

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
  }),

  // 4. Break-up / Final Follow-up (10 days later)
  STEP_4: (name: string) => ({
    subject: `One last check-in`,
    body: `
Hi ${name},

I'm reaching out one last time regarding Fretbox. If now isn't the right time for ${name} to explore a new campus management solution, I completely understand.

I'll stop my outreach for now, but if you're ever looking to digitize your campus operations in the future, please don't hesitate to reach out.

Wishing you the best,

Ashish Gupta
Founder, Fretbox
    `.trim(),
  }),

  // 5. Auto-Reply: Positive Interest / More Info
  POSITIVE_INTEREST: (name: string, uniName: string) => ({
    subject: `Deep dive: Fretbox x ${uniName}`,
    body: `
Hi ${name},

I'm glad to hear you're interested in learning more about how Fretbox can help ${uniName}.

I've attached a detailed brochure that covers our core modules: Hostel Management, Digital Security, and Student Engagement.

Would you like to schedule a 15-minute demo to see the platform in action? You can pick a time that works best for you here: https://calendly.com/fretbox-demo

Best regards,

Ashish Gupta
Founder, Fretbox
    `.trim(),
  }),

  // 6. Auto-Reply: Meeting Request Acknowledgement
  MEETING_REQUEST_ACK: (name: string, uniName: string) => ({
    subject: `Let's connect: Fretbox x ${uniName}`,
    body: `
Hi ${name},

Looking forward to our call! I've received your request for a demo/meeting.

To make our time most productive, feel free to book a specific slot on my calendar here: https://calendly.com/fretbox-demo

I'll also prepare a custom walkthrough based on ${uniName}'s specific needs.

See you soon,

Ashish Gupta
Founder, Fretbox
    `.trim(),
  }),
};
