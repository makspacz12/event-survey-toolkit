/**
 * Where the robot goes on the landing page, on any screen.
 *
 * THE PROBLEM. The landing page stacks three things in one screen height: the
 * intro text at the top, the robot in the middle, the Start button at the
 * bottom. The robot's stage used to start at a fixed 34% of the screen. The
 * text above it has no fixed height: on a narrow phone its sentences wrap onto
 * more lines, and a browser's address bar takes a different bite out of the
 * screen on every device. Nothing tied the two together, so on 7 of 14 measured
 * screen sizes, including an iPhone SE, the text ran over the robot's head.
 *
 * THE IDEA. Stop guessing with percentages and compute the layout from three
 * numbers measured on the actual device: the height of the screen, the height
 * the text really takes, and where the button really starts. From those, this
 * function decides everything else. It is pure arithmetic with no DOM in it,
 * so it can be tested against thousands of screen sizes without a browser.
 *
 * THE ONE FACT ABOUT THE ROBOT IT RELIES ON. The 3D scene scales with the
 * height of its stage, and the robot's head always starts the same fraction of
 * the way down it: measured between 15.5% and 16.2% on fourteen screens from
 * 320x480 to 1280x800. So for a stage that starts at `top` on a screen of
 * height H:
 *
 *     headTop = top + headTopFraction * (H - top)
 *
 * Requiring headTop >= textBottom + GAP and solving for `top` gives
 *
 *     top >= (textBottom + GAP - headTopFraction * H) / (1 - headTopFraction)
 *
 * That is the whole positioning rule: the stage is allowed to start ABOVE the
 * end of the text by exactly the empty margin it carries over the head, so the
 * robot is as large as it can be while its head still clears the text.
 *
 * THREE REGIMES, in order of preference:
 *
 *   robot      There is room. The stage sits at the designed 34% if that
 *              already clears the text, otherwise it is pushed down by the
 *              rule above. If the band between text and button is small, the
 *              text is scaled down a little (never below SCALE_MIN) to give
 *              the robot a fair share of the screen.
 *
 *   text-only  Even at the smallest text scale the robot's head would not fit
 *              between the text and the button. A head cut in half by the
 *              Start button is worse than no robot, so it is hidden. The text
 *              gets its full size back if it fits, and is scaled only if it
 *              would otherwise touch the button.
 *
 *   scroll     The text alone does not fit above the button (a phone on its
 *              side). Nothing is shrunk further; the page becomes an ordinary
 *              scrolling column. Overlap is never the fallback.
 */

/** What the robot's picture looks like, as fractions of its stage height. */
export interface RobotGeometry {
  /** Where the topmost drawn thing starts (the head, or the hint above it). */
  top: number
  /** Where the head ends. Above this line the robot is not recognisable. */
  headBottom: number
}

export interface FitInput {
  /** Height of the landing page: the real visible screen, address bar and all. */
  screenH: number
  /** The header's top padding, which does not scale with the text. */
  padTop: number
  /** Natural height of the intro text block, at scale 1. */
  textH: number
  /** Where the Start button begins, measured from the top of the screen. */
  buttonTop: number
  robot: RobotGeometry
}

export interface Fit {
  mode: 'robot' | 'text-only' | 'scroll'
  /** Scale applied to the text block, SCALE_MIN..1. */
  scale: number
  /** Top edge of the robot's stage in px, or null when the robot is hidden. */
  stageTop: number | null
  /** Where the (scaled) text ends. */
  textBottom: number
}

/** Clear space between the last line of text and the robot. */
export const GAP = 12
/** Where the stage starts when nothing forces it lower: the designed look. */
export const DESIGN_TOP = 0.34
/** The text is never scaled below this. 13px body text stays above 11px. */
export const SCALE_MIN = 0.86
/** Share of the screen the robot should get between text and button, if it can. */
export const BAND_TARGET = 0.3
/** Space kept between the text and the Start button when there is no robot. */
export const TEXT_BUTTON_GAP = 10
/** The head must end at least this far above the button to count as visible. */
export const HEAD_CLEARANCE = 4

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function fitLanding(input: FitInput): Fit {
  const { screenH, padTop, textH, buttonTop, robot } = input
  const textBottomAt = (s: number) => padTop + textH * s

  // Degenerate measurements (first frame, hidden tab): the designed layout.
  if (!(screenH > 0) || !(textH > 0) || !(buttonTop > 0)) {
    return { mode: 'robot', scale: 1, stageTop: DESIGN_TOP * Math.max(0, screenH), textBottom: textBottomAt(1) }
  }

  // 1. How much to scale the text: only as much as buys the robot its band.
  const wanted = (buttonTop - GAP - BAND_TARGET * screenH - padTop) / textH
  const scale = clamp(wanted, SCALE_MIN, 1)
  const textBottom = textBottomAt(scale)

  // 2. Where the stage must start so the robot clears the text.
  const pushed = (textBottom + GAP - robot.top * screenH) / (1 - robot.top)
  const stageTop = Math.max(DESIGN_TOP * screenH, pushed)
  const stageH = screenH - stageTop
  const headBottom = stageTop + robot.headBottom * stageH

  if (stageH > 0 && headBottom <= buttonTop - HEAD_CLEARANCE) {
    return { mode: 'robot', scale, stageTop, textBottom }
  }

  // 3. No room for a whole head. Drop the robot and give the text its size back.
  const limit = buttonTop - TEXT_BUTTON_GAP
  // Asked at the smallest scale, not at the computed one: dividing by textH and
  // multiplying back can land a hair past the limit, and a rounding error must
  // not be what turns a page that fits into a page that scrolls.
  if (textBottomAt(SCALE_MIN) <= limit) {
    const textScale = clamp((limit - padTop) / textH, SCALE_MIN, 1)
    return {
      mode: 'text-only',
      scale: textScale,
      stageTop: null,
      textBottom: Math.min(textBottomAt(textScale), limit),
    }
  }

  // 4. The text alone does not fit: scroll, at full size.
  return { mode: 'scroll', scale: 1, stageTop: null, textBottom: textBottomAt(1) }
}
