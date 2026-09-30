// Sportwire usa solo queste funzioni di Motion (motion.dev, MIT). esbuild tiene solo ciò che è importato qui.
//  animate  — versione «mini»: anima con la Web Animations API del browser (fuori dal thread principale, interrompibile)
//  spring   — molle fisiche, convertite in curve linear() native
//  stagger  — ritardi a cascata per i gruppi
//  inView   — IntersectionObserver con pulizia automatica
export { animate } from "motion/mini";
export { stagger, inView, spring } from "motion";
