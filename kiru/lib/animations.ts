import { FadeInDown, FadeInUp, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

/** Standard entering animation for messages */
export const messageEntering = FadeInDown.duration(300).springify().damping(20).stiffness(200);

/** Fade in for general elements */
export const fadeIn = FadeIn.duration(250);

/** Fade out */
export const fadeOut = FadeOut.duration(200);

/** Slide up for bottom elements (input, banners) */
export const slideUp = FadeInUp.duration(300);

/** Slide in from bottom for sheets */
export const sheetEntering = SlideInDown.duration(300).springify().damping(25);
export const sheetExiting = SlideOutDown.duration(250);

/** Duration constants */
export const ANIM = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: { damping: 20, stiffness: 200 },
} as const;
