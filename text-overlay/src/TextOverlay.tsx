import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Montserrat";
import { fitTextOnNLines } from "@remotion/layout-utils";

// Chromium on Linux has no Apple emoji font (it's proprietary to Apple's
// OSes), so a raw emoji character renders as a mismatched or missing glyph.
// For the specific emoji we're asked to show in Apple's style, we composite
// the actual Apple artwork (from the public emoji-datasource-apple dataset,
// the same source many chat apps use for an "Apple style" emoji option)
// as an image instead of relying on font fallback.
const APPLE_EMOJI_IMAGES: Record<string, string> = {
  "1f643": staticFile("emoji/1f643.png"), // 🙃 upside-down face
};

const EMOJI_PATTERN = /\p{Extended_Pictographic}️?/gu;

const toUnifiedCodepoint = (emoji: string): string =>
  Array.from(emoji.replace(/️/g, ""))
    .map((char) => char.codePointAt(0)!.toString(16))
    .join("-");

const renderLineContent = (text: string, fontSize: number): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  EMOJI_PATTERN.lastIndex = 0;
  while ((match = EMOJI_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const src = APPLE_EMOJI_IMAGES[toUnifiedCodepoint(match[0])];
    if (src) {
      nodes.push(
        <Img
          key={match.index}
          src={src}
          style={{
            width: fontSize,
            height: fontSize,
            verticalAlign: "-0.15em",
            display: "inline-block",
          }}
        />,
      );
    } else {
      nodes.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
};

// ---------------------------------------------------------------------------
// Tunables. Everything the animation depends on lives here as props with
// defaults, so retiming/restyling never requires touching the JSX below.
// Composition duration derives from `lines` automatically (see
// calculateTextOverlayMetadata) — add, remove, or retime a line just by
// editing this list.
// ---------------------------------------------------------------------------

export type ScrimStyle = "shadow" | "panel";

export type LineConfig = {
  /** Cyrillic (or any) copy for this line. */
  text: string;
  /** How long this line holds on screen, in seconds — this is its whole
   * slot, including its own enter and exit animation. */
  holdSeconds: number;
};

export type TextOverlayProps = {
  /** The sequence of lines shown one after another. Each line fully fades
   * out before the next starts fading in — no overlap. */
  lines: LineConfig[];

  /** How many frames a line's entrance spring takes to settle. */
  enterDurationFrames: number;
  /** How many frames every line's exit takes (including the last, so every
   * line fades out the same way). */
  exitDurationFrames: number;

  /** How many frames before a line becomes visible it is premounted for
   * font loading / layout measurement. */
  premountFrames: number;

  /** Horizontal slide distance for enter/exit, in pixels. */
  slideDistance: number;
  /** Scale a line starts at on entry, animating up to 1. */
  entryScaleFrom: number;

  /** Upper bound on the auto-fit font size, in pixels. */
  maxFontSize: number;
  /** Upper bound on text block width, in pixels (clamped to the safe area). */
  maxTextWidth: number;
  /** Max number of lines the auto-fit algorithm may wrap a single line of
   * copy onto. */
  maxLines: number;

  textColor: string;
  fontWeight: number;

  /** "shadow" = soft drop shadow on the text; "panel" = translucent rounded
   * panel behind the text. */
  scrim: ScrimStyle;
  scrimPanelColor: string;
  scrimTextShadow: string;

  /** Safe-area insets, in pixels, at 1080x1920. */
  safeAreaTop: number;
  safeAreaBottom: number;
  safeAreaSide: number;
  /** Extra clearance on the right, in pixels, to stay clear of the
   * platform icon rail (like/comment/share buttons). */
  safeAreaRight: number;
  /** Vertical anchor for the text block, as a fraction of the frame height. */
  verticalCenterPercent: number;

  /** Optional background video. Left unset, the background stays fully
   * transparent so the overlay can be composited in an editor. */
  backgroundVideo?: string;
  backgroundVideoVolume?: number;
  /** Optional solid fill behind everything (e.g. a chroma-key green/magenta
   * for editors that don't import alpha video reliably). Left unset, the
   * background stays fully transparent. Ignored when backgroundVideo is
   * set. */
  backgroundColor?: string;
};

export const TEXT_OVERLAY_FPS = 30;

export const textOverlayDefaultProps: TextOverlayProps = {
  lines: [
    { text: "Запиши час, като цъкнеш на линка в описанието", holdSeconds: 3.5 },
  ],

  enterDurationFrames: 20,
  exitDurationFrames: 16,

  premountFrames: 30,

  slideDistance: 180,
  entryScaleFrom: 0.96,

  maxFontSize: 110,
  maxTextWidth: 888,
  maxLines: 3,

  textColor: "#ffffff",
  fontWeight: 800,

  scrim: "shadow",
  scrimPanelColor: "rgba(10, 10, 10, 0.45)",
  scrimTextShadow: "0px 4px 18px rgba(0, 0, 0, 0.55), 0px 1px 4px rgba(0, 0, 0, 0.7)",

  safeAreaTop: 240,
  safeAreaBottom: 420,
  safeAreaSide: 96,
  safeAreaRight: 200,
  verticalCenterPercent: 0.42,

  backgroundVideo: undefined,
  backgroundVideoVolume: 1,
  backgroundColor: undefined,
};

/** Cumulative frame at which each line nominally starts, plus a trailing
 * entry for the end of the whole sequence — so line `i` nominally spans
 * `[frameBoundaries[i], frameBoundaries[i + 1])`. */
const getFrameBoundaries = (lines: LineConfig[], fps: number): number[] => {
  const boundaries = [0];
  for (const line of lines) {
    boundaries.push(boundaries[boundaries.length - 1] + Math.round(line.holdSeconds * fps));
  }
  return boundaries;
};

export const calculateTextOverlayMetadata: CalculateMetadataFunction<TextOverlayProps> = ({
  props,
}) => {
  const boundaries = getFrameBoundaries(props.lines, TEXT_OVERLAY_FPS);
  return {
    fps: TEXT_OVERLAY_FPS,
    durationInFrames: boundaries[boundaries.length - 1],
  };
};

const { fontFamily, waitUntilDone: waitForFont } = loadFont("normal", {
  weights: ["700", "800"],
  subsets: ["cyrillic", "latin"],
});

export const preloadTextOverlayFont = waitForFont;

type TextLineProps = {
  text: string;
  inDuration: number;
  outStart: number;
  outDuration: number;
  slideDistance: number;
  entryScaleFrom: number;
  maxFontSize: number;
  maxTextWidth: number;
  maxLines: number;
  fontWeight: number;
  textColor: string;
  scrim: ScrimStyle;
  scrimPanelColor: string;
  scrimTextShadow: string;
};

const TextLine: React.FC<TextLineProps> = ({
  text,
  inDuration,
  outStart,
  outDuration,
  slideDistance,
  entryScaleFrom,
  maxFontSize,
  maxTextWidth,
  maxLines,
  fontWeight,
  textColor,
  scrim,
  scrimPanelColor,
  scrimTextShadow,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    durationInFrames: inDuration,
    config: {
      damping: 200,
      mass: 0.7,
      stiffness: 120,
    },
  });

  const enterX = interpolate(enter, [0, 1], [slideDistance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const enterOpacity = interpolate(enter, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const enterScale = interpolate(enter, [0, 1], [entryScaleFrom, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const exitProgress = interpolate(frame, [outStart, outStart + outDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const exitX = interpolate(exitProgress, [0, 1], [0, -slideDistance], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const { fontSize, lines } = fitTextOnNLines({
    text,
    fontFamily,
    fontWeight,
    maxLines,
    maxBoxWidth: maxTextWidth,
    maxFontSize,
    validateFontIsLoaded: true,
  });

  return (
    <div
      style={{
        transform: `translateX(${enterX + exitX}px) scale(${enterScale})`,
        opacity: enterOpacity * exitOpacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        maxWidth: maxTextWidth,
        padding: scrim === "panel" ? "32px 56px" : 0,
        borderRadius: scrim === "panel" ? 36 : 0,
        backgroundColor: scrim === "panel" ? scrimPanelColor : "transparent",
      }}
    >
      {lines.map((line, index) => (
        <div
          key={index}
          style={{
            fontFamily,
            fontWeight,
            fontSize,
            lineHeight: 1.18,
            color: textColor,
            textAlign: "center",
            whiteSpace: "nowrap",
            textShadow: scrim === "shadow" ? scrimTextShadow : "none",
          }}
        >
          {renderLineContent(line, fontSize)}
        </div>
      ))}
    </div>
  );
};

export const TextOverlay: React.FC<TextOverlayProps> = (props) => {
  const {
    lines,
    enterDurationFrames,
    exitDurationFrames,
    premountFrames,
    slideDistance,
    entryScaleFrom,
    maxFontSize,
    maxTextWidth,
    maxLines,
    textColor,
    fontWeight,
    scrim,
    scrimPanelColor,
    scrimTextShadow,
    safeAreaTop,
    safeAreaBottom,
    safeAreaSide,
    safeAreaRight,
    verticalCenterPercent,
    backgroundVideo,
    backgroundVideoVolume,
    backgroundColor,
  } = props;

  const { width, fps } = useVideoConfig();

  const leftInset = safeAreaSide;
  const rightInset = Math.max(safeAreaSide, safeAreaRight);
  const availableWidth = width - leftInset - rightInset;
  const effectiveMaxTextWidth = Math.min(maxTextWidth, availableWidth);

  const boundaries = getFrameBoundaries(lines, fps);

  const sharedLineProps = {
    slideDistance,
    entryScaleFrom,
    maxFontSize,
    maxTextWidth: effectiveMaxTextWidth,
    maxLines,
    fontWeight,
    textColor,
    scrim,
    scrimPanelColor,
    scrimTextShadow,
  };

  return (
    <AbsoluteFill>
      {backgroundVideo ? (
        <AbsoluteFill>
          <OffthreadVideo src={backgroundVideo} volume={backgroundVideoVolume} />
        </AbsoluteFill>
      ) : backgroundColor ? (
        <AbsoluteFill style={{ backgroundColor }} />
      ) : null}

      <AbsoluteFill
        style={{
          top: safeAreaTop,
          bottom: safeAreaBottom,
          left: leftInset,
          right: rightInset,
          width: "auto",
          height: "auto",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 0,
            top: `${verticalCenterPercent * 100}%`,
          }}
        >
          {lines.map((line, index) => {
            // Each line occupies its own slot with no overlap: it fades in
            // at the start of the slot, holds, then fades out completely
            // before the next line's slot — and thus its own fade-in —
            // begins.
            const from = boundaries[index];
            const durationInFrames = boundaries[index + 1] - from;
            const outStart = durationInFrames - exitDurationFrames;

            return (
              <Sequence
                key={index}
                from={from}
                durationInFrames={durationInFrames}
                premountFor={premountFrames}
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <TextLine
                  text={line.text}
                  inDuration={enterDurationFrames}
                  outStart={outStart}
                  outDuration={exitDurationFrames}
                  {...sharedLineProps}
                />
              </Sequence>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
