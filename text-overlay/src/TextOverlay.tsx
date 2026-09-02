import React from "react";
import {
  AbsoluteFill,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Montserrat";
import { fitTextOnNLines } from "@remotion/layout-utils";

// ---------------------------------------------------------------------------
// Tunables. Everything the animation depends on lives here as props with
// defaults, so retiming/restyling never requires touching the JSX below.
// ---------------------------------------------------------------------------

export type ScrimStyle = "shadow" | "panel";

export type TextOverlayProps = {
  /** Line 1 copy (Cyrillic). */
  line1: string;
  /** Line 2 copy (Cyrillic). */
  line2: string;

  /** Frame line 1 starts entering. */
  line1InStart: number;
  /** How many frames the line-1 entrance spring takes to settle. */
  line1InDuration: number;
  /** Frame line 1 starts sliding out. */
  line1OutStart: number;
  /** How many frames the line-1 exit takes. */
  line1OutDuration: number;

  /** Frame line 2 starts entering (overlaps the line-1 exit). */
  line2InStart: number;
  /** How many frames the line-2 entrance spring takes to settle. */
  line2InDuration: number;
  /** Frame (absolute) by which line 2 has fully exited — the composition end. */
  line2OutEnd: number;
  /** How many frames the line-2 exit takes. */
  line2OutDuration: number;

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
  /** Max number of lines the auto-fit algorithm may wrap text onto. */
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
};

export const textOverlayDefaultProps: TextOverlayProps = {
  line1: "44 евро за корт, ракети и топки.",
  line2: "Звучи много?",

  line1InStart: 0,
  line1InDuration: 20,
  line1OutStart: 52,
  line1OutDuration: 16,

  line2InStart: 56,
  line2InDuration: 20,
  line2OutEnd: 120,
  line2OutDuration: 8,

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
          {line}
        </div>
      ))}
    </div>
  );
};

export const TextOverlay: React.FC<TextOverlayProps> = (props) => {
  const {
    line1,
    line2,
    line1InStart,
    line1InDuration,
    line1OutStart,
    line1OutDuration,
    line2InStart,
    line2InDuration,
    line2OutEnd,
    line2OutDuration,
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
  } = props;

  const { width } = useVideoConfig();

  const leftInset = safeAreaSide;
  const rightInset = Math.max(safeAreaSide, safeAreaRight);
  const availableWidth = width - leftInset - rightInset;
  const effectiveMaxTextWidth = Math.min(maxTextWidth, availableWidth);

  const line1From = line1InStart;
  const line1Duration = line1OutStart + line1OutDuration - line1From;

  const line2From = line2InStart;
  const line2Duration = line2OutEnd - line2From;
  const line2RelativeOutStart = line2OutEnd - line2OutDuration - line2From;

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
          <Sequence
            from={line1From}
            durationInFrames={line1Duration}
            premountFor={premountFrames}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <TextLine
              text={line1}
              inDuration={line1InDuration}
              outStart={line1OutStart - line1From}
              outDuration={line1OutDuration}
              {...sharedLineProps}
            />
          </Sequence>

          <Sequence
            from={line2From}
            durationInFrames={line2Duration}
            premountFor={premountFrames}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <TextLine
              text={line2}
              inDuration={line2InDuration}
              outStart={line2RelativeOutStart}
              outDuration={line2OutDuration}
              {...sharedLineProps}
            />
          </Sequence>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
