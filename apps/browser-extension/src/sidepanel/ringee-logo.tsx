import wordmarkBlack from "../assets/ringee-wordmark-black.png";
import wordmarkWhite from "../assets/ringee-wordmark-white.png";

/**
 * The official Ringee wordmark, bundled into the extension so the side panel is
 * branded identically to the web app. Black wordmark on light, white on dark
 * (driven by the existing `.dark` variant in theme.css).
 */
export function RingeeLogo({ className = "h-6" }: { className?: string }) {
  return (
    <>
      <img
        src={wordmarkBlack}
        alt="Ringee"
        className={`${className} w-auto dark:hidden`}
      />
      <img
        src={wordmarkWhite}
        alt="Ringee"
        className={`${className} hidden w-auto dark:block`}
      />
    </>
  );
}
