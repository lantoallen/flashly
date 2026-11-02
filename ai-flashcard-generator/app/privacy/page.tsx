import type { Metadata } from "next";
import { LegalPage, REPO_URL } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Flashly stores, where it goes, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Flashly is built to collect as little as possible. This page explains exactly what is stored, where it goes, and how you can remove it."
    >
      <section>
        <h2>1. The short version</h2>
        <ul>
          <li>No ads, no tracking scripts, and we don’t sell your data.</li>
          <li>Your sets are stored in your browser unless you sign in.</li>
          <li>
            Text you send to the AI is processed by third-party AI providers.
          </li>
          <li>You can export or delete your data at any time.</li>
        </ul>
      </section>

      <section id="storage">
        <h2>2. Cookies and local storage</h2>
        <p className="mt-3">
          Flashly does not set cookies of its own. It uses your browser’s local
          storage to remember things on your device:
        </p>
        <ul>
          <li>your sets, study progress, streaks and daily goal;</li>
          <li>your theme, accent color and study buddy’s name;</li>
          <li>whether you accepted the terms and the storage notice;</li>
          <li>your sign-in session, if you create an account;</li>
          <li>your chat history with the study buddy.</li>
        </ul>
        <p className="mt-3">
          This is needed for the app to work. You can clear it any time in your
          browser’s site settings; doing so removes your local sets, so back
          them up first or use an account.
        </p>
      </section>

      <section>
        <h2>3. Accounts</h2>
        <p className="mt-3">
          If you create an account we store your email address, an optional
          display name, your study data (sets, progress, goal and streak
          counts), and a record of which terms version you accepted and when.
          Sign-in is handled by our authentication provider (Supabase); your
          password is stored only as a hash and is never visible to us.
        </p>
        <p className="mt-3">
          Account data is used only to sign you in and sync your sets across
          your devices.
        </p>
      </section>

      <section>
        <h2>4. Community profile, posts and messages</h2>
        <p className="mt-3">
          If you use the community features we store the following in our
          database:
        </p>
        <ul>
          <li>
            <strong>Profile:</strong> a username, display name, optional photo
            (a small image stored with your profile), bio, interests, accent
            color, and your privacy choices. Other signed-in members can see
            these, apart from your privacy choices.
          </li>
          <li>
            <strong>Birthday (optional):</strong> shown only to you. It is used
            to keep the community age-appropriate and is never displayed to
            others.
          </li>
          <li>
            <strong>Posts and likes:</strong> sets you publish (public or
            private) and the sets you like.
          </li>
          <li>
            <strong>Messages:</strong> the text you send, who it went to, and
            when it was read. Only the two people in a conversation can read it
            through the app. Messages are not end-to-end encrypted, so people
            who administer the database could technically access them.
          </li>
          <li>
            <strong>Blocks and reports:</strong> who you blocked, and reports
            you file, so they can be reviewed. When you file a report, its
            details (what was reported, your reason, the usernames involved and,
            for a message, its text) are emailed to the site’s moderator through
            an email delivery service so it can be looked at quickly.
          </li>
        </ul>
        <p className="mt-3">
          You can edit your profile, make posts private, delete posts, block
          people and turn direct messages off at any time.
        </p>
      </section>

      <section>
        <h2>5. AI processing</h2>
        <p className="mt-3">
          When you generate cards, add more cards, use “Explain”, or chat with
          the study buddy, the text you submit (your notes, topic, the card’s
          term and definition, or your chat messages) is sent
          from our server to an AI provider such as Groq, and, if they are
          configured as backups, Google Gemini, Cerebras or OpenRouter. That
          provider’s own terms and privacy policy apply to how they handle it.
          Don’t submit anything confidential.
        </p>
        <p className="mt-3">
          If you generate cards from a document (such as a PDF, Word or
          PowerPoint file), the file is read in your browser and is never
          uploaded. Only the text you choose to use from it is sent to the AI
          provider, in the same way as pasted notes.
        </p>
        <p className="mt-3">
          We don’t store your notes or documents on our server, and we don’t
          send your whole library to AI providers, only the text for the request
          you make.
        </p>
      </section>

      <section>
        <h2>6. Share links</h2>
        <p className="mt-3">
          A share link contains the set itself in the part of the URL after the
          “#”, which browsers don’t send to servers. Anyone you give the link to
          can read that set, so only share what you’re happy for them to see.
        </p>
      </section>

      <section>
        <h2>7. Hosting logs</h2>
        <p className="mt-3">
          Our hosting platform may keep standard technical logs (such as IP
          address, browser type and request time) for security and operation of
          the service. Flashly doesn’t use these to profile you.
        </p>
      </section>

      <section>
        <h2>8. Your choices</h2>
        <ul>
          <li>
            <strong>Export:</strong> download any set as CSV or JSON, or back up
            your whole library from the Library page.
          </li>
          <li>
            <strong>Delete local data:</strong> remove sets from the Library, or
            clear this site’s data in your browser.
          </li>
          <li>
            <strong>Delete cloud data:</strong> on the Account page you can
            delete everything stored in your account and sign out. Deleting
            your account also removes your profile, the sets you shared, your
            likes and your messages. Copies other members already saved to
            their own libraries stay with them.
          </li>
          <li>
            <strong>Withdraw consent:</strong> stop using Flashly and delete your
            data using the options above.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Children and age</h2>
        <p className="mt-3">
          Flashly is not intended for children under 13, and accounts require
          you to be at least 13. If you enter a birthday that makes you younger
          than 13, we won’t save it. Direct messages are off for every new
          account until you turn them on, and if you enter a birthday that
          makes you under 18 we switch them off for you.
        </p>
      </section>

      <section>
        <h2>10. Changes and contact</h2>
        <p className="mt-3">
          If this policy changes, the version date above changes and you may be
          asked to accept it again. For questions or requests, open an issue on
          the{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            project page
          </a>
          .
        </p>
        <p className="mt-3 text-sm">
          This page describes how this app is built. If you run your own copy,
          update the contact details and review the policy for your region.
        </p>
      </section>
    </LegalPage>
  );
}
