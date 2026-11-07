/** The uspeshnyy.ru mark (hexagon with a flag), inlined from https://uspeshnyy.ru/assets/logo.svg. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 776 870" aria-hidden="true">
      <path
        fill="#37a4d3"
        fillRule="evenodd"
        d="M 548,183 L 526,208 L 506,222 L 478,234 L 451,239 L 395,234 L 328,214 L 280,204 L 228,207 L 195,217 L 168,232 L 148,224 L 139,227 L 132,234 L 131,248 L 263,622 L 298,718 L 311,732 L 325,733 L 334,728 L 339,720 L 339,709 L 268,518 L 269,512 L 304,488 L 353,476 L 393,478 L 489,497 L 528,497 L 557,492 L 585,482 L 615,465 L 641,444 L 661,422 Z M 376,10 L 338,23 L 49,194 L 29,216 L 19,236 L 14,260 L 14,604 L 17,627 L 28,652 L 60,683 L 337,845 L 367,857 L 397,859 L 438,845 L 724,677 L 745,655 L 756,630 L 760,598 L 759,256 L 745,216 L 715,187 L 434,22 L 409,12 Z M 380,43 L 404,45 L 425,55 L 697,215 L 718,236 L 727,262 L 727,608 L 720,631 L 705,649 L 421,816 L 397,825 L 374,824 L 352,815 L 80,656 L 59,638 L 48,610 L 48,258 L 56,236 L 70,220 L 355,52 Z"
      />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[21px] font-bold tracking-[-0.01em]">USP Stories</span>
        <span className="mt-[3px] self-end text-[10.5px] font-medium text-muted">by Aleksandr Uspeshnyy</span>
      </span>
    </span>
  )
}
