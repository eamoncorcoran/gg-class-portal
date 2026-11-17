// One icon suite for every non-navigation glyph in the app: Phosphor in its bold weight, the rounded
// chunky line Duolingo draws its small icons with. Exported under the names the app already used,
// so a file only changes its import path. Navigation keeps the coloured duo-icons.
import type { IconProps } from "@phosphor-icons/react";
import * as P from "@phosphor-icons/react";

type Ic = (p: IconProps) => React.JSX.Element;
const bold =
    (I: P.Icon): Ic =>
    (p) => <I size={24} weight="bold" {...p} />;

export const ChevronDown = bold(P.CaretDown);
export const ChevronUp = bold(P.CaretUp);
export const ChevronLeft = bold(P.CaretLeft);
export const ChevronRight = bold(P.CaretRight);
export const ChevronLeftDouble = bold(P.CaretDoubleLeft);
export const ChevronRightDouble = bold(P.CaretDoubleRight);
export const ChevronSelectorVertical = bold(P.CaretUpDown);
export const SearchLg = bold(P.MagnifyingGlass);
export const Plus = bold(P.Plus);
export const Minus = bold(P.Minus);
export const HelpCircle = bold(P.Question);
export const InfoCircle = bold(P.Info);
export const AlertCircle = bold(P.WarningCircle);
export const ArrowRight = bold(P.ArrowRight);
export const ArrowLeft = bold(P.ArrowLeft);
export const ArrowUp = bold(P.ArrowUp);
export const ArrowDown = bold(P.ArrowDown);
export const ArrowNarrowRight = bold(P.ArrowRight);
export const ArrowNarrowLeft = bold(P.ArrowLeft);
export const User01 = bold(P.User);
export const Users01 = bold(P.Users);
export const Settings01 = bold(P.Gear);
export const LogOut01 = bold(P.SignOut);
export const Check = bold(P.Check);
export const CheckCircle = bold(P.CheckCircle);
export const X = bold(P.X);
export const XClose = bold(P.X);
export const XCircle = bold(P.XCircle);
export const Trash01 = bold(P.Trash);
export const Play = bold(P.Play);
export const PlayCircle = bold(P.PlayCircle);
export const PauseCircle = bold(P.PauseCircle);
export const Clock = bold(P.Clock);
export const Printer = bold(P.Printer);
export const Moon01 = bold(P.Moon);
export const Copy01 = bold(P.Copy);
export const FileCheck02 = bold(P.ListChecks);
export const FileCode01 = bold(P.FileCode);
export const BookOpen01 = bold(P.BookOpen);
export const BookClosed = bold(P.Book);
export const UploadCloud02 = bold(P.CloudArrowUp);
export const LifeBuoy01 = bold(P.Lifebuoy);
export const Grid01 = bold(P.SquaresFour);
export const Star01 = bold(P.Star);
export const Stars02 = bold(P.Sparkle);
export const Share07 = bold(P.ShareNetwork);
export const Share04 = bold(P.Export);
export const Scissors01 = bold(P.Scissors);
export const RefreshCcw01 = bold(P.ArrowCounterClockwise);
export const RefreshCcw02 = bold(P.ArrowsClockwise);
export const Menu02 = bold(P.List);
export const List = bold(P.ListBullets);
export const Edit01 = bold(P.PencilSimple);
export const Edit03 = bold(P.PencilSimple);
export const Edit04 = bold(P.PencilSimpleLine);
export const Edit05 = bold(P.NotePencil);
export const Download01 = bold(P.DownloadSimple);
export const DotsVertical = bold(P.DotsThreeVertical);
export const Cube01 = bold(P.Cube);
export const Code02 = bold(P.Code);
export const Calendar = bold(P.Calendar);
export const BookmarkCheck = bold(P.BookmarkSimple);
export const TerminalSquare = bold(P.Terminal);
export const Shuffle01 = bold(P.Shuffle);
export const Minimize01 = bold(P.ArrowsIn);
export const Expand01 = bold(P.ArrowsOut);
export const Lightbulb02 = bold(P.Lightbulb);
export const Smile = bold(P.Smiley);
export const LayoutRight = bold(P.SidebarSimple);
export const LayersTwo01 = bold(P.Stack);
export const HomeLine = bold(P.House);
export const Headphones01 = bold(P.Headphones);
export const FlipBackward = bold(P.ArrowUUpLeft);
export const FilterLines = bold(P.Funnel);
export const FilterSimple = bold(P.FunnelSimple);
export const Bookmark = bold(P.BookmarkSimple);
export const CheckSquare = bold(P.CheckSquare);
export const Square = bold(P.Square);
export const Feather = bold(P.Feather);
export const Eye = bold(P.Eye);
export const EyeOff = bold(P.EyeSlash);
export const Container = bold(P.Package);
export const Bell01 = bold(P.Bell);
export const Microphone01 = bold(P.Microphone);

// The three tools over a list of questions are drawn in the regular weight: a lighter line that sits
// beside a line of text without shouting, where the bold cut looked heavy and blobby at this size.
const regular =
    (I: P.Icon): Ic =>
    (p) => <I size={24} weight="regular" {...p} />;
export const ToolBookmark = regular(P.BookmarkSimple);
export const ToolPrinter = regular(P.Printer);
export const ToolFilter = regular(P.FunnelSimple);
