/** Central Motion re-export so `prefers-reduced-motion` handling can evolve
 *  in one place (MotionFeature settings, LazyMotion, etc.). */
export { motion, AnimatePresence, useReducedMotion, type Transition } from "motion/react";
export const pageVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18 } },
} as const;

export const cardHover = {
  rest: { y: 0, boxShadow: "0 1px 3px 0 rgb(16 24 40 / 0.06)" },
  hover: { y: -3, boxShadow: "0 12px 28px -8px rgb(11 31 58 / 0.18)" },
} as const;
