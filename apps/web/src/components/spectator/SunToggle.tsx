/**
 * The escape hatch, in the header.
 *
 * It sits beside the sign-in controls rather than in the follow panel because
 * the moment it is needed is the moment the screen became hard to read, and
 * hunting for a control you cannot see is not a recovery. It keeps its label:
 * an unlabelled sun icon is a guess, and this is a volunteer's first visit.
 */
export default function SunToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className={on ? 'sun-toggle is-on' : 'sun-toggle'}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      title={on ? 'Switch back to the standard board' : 'Higher contrast for reading in direct sun'}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.1" />
        <path d="M12 2.4v2.3M12 19.3v2.3M2.4 12h2.3M19.3 12h2.3M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
      </svg>
      Bright sun
    </button>
  );
}
