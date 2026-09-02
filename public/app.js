
const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');

const state = {
  user: null,
  view: null,
  classes: [],
  students: [],
  assignments: [],
  settings: null,
  activeClassId: null,
  tracker: null,
  filter: 'all',
  trackerSearch: '',
  engagementItem: null,
  calendarMonth: null,
  assignmentView: 'calendar',
  assignmentMonth: null,
  assignmentClassId: null,
  checkinClassId: null,
  scheduleSkips: new Set(),
  showArchived: false,
  teachingWeeks: [],
  profile: null,
  engagement: null,
  studentData: null,
  reviewQueue: [],
  reviewIndex: 0,
  activeReview: null,
  checkinForm: null,
  homeworkForm: null,
  community: null,
  communityClassId: null,
  communityThread: null,
  courses: null,
  course: null,
  lessonId: null,
  admins: null,
  boardCategoryId: null,
  boardSort: 'new',
};

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const svg = {
  camera: `<svg viewBox="0 0 24 24" fill="none"><path d="M2 8.377c0-.35 0-.525.015-.673a3 3 0 0 1 2.69-2.69C4.851 5 5.035 5 5.404 5c.143 0 .214 0 .274-.004a2 2 0 0 0 1.735-1.25c.023-.056.044-.12.086-.246.042-.127.063-.19.086-.246a2 2 0 0 1 1.735-1.25C9.38 2 9.448 2 9.58 2h4.838c.133 0 .2 0 .26.004a2 2 0 0 1 1.735 1.25c.023.056.044.12.086.246.042.127.063.19.086.246a2 2 0 0 0 1.735 1.25c.06.004.131.004.273.004.37 0 .554 0 .702.015a3 3 0 0 1 2.69 2.69c.014.147.014.322.014.672V16.2c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311C19.72 21 18.88 21 17.2 21H6.8c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311C2 18.72 2 17.88 2 16.2V8.377Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 16.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none"><path d="m12 21-.1-.15c-.695-1.042-1.042-1.563-1.5-1.94a4 4 0 0 0-1.378-.737C8.453 18 7.827 18 6.575 18H5.2c-1.12 0-1.68 0-2.108-.218a2 2 0 0 1-.874-.874C2 16.48 2 15.92 2 14.8V6.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C3.52 3 4.08 3 5.2 3h.4c2.24 0 3.36 0 4.216.436a4 4 0 0 1 1.748 1.748C12 6.04 12 7.16 12 9.4M12 21V9.4M12 21l.1-.15c.695-1.042 1.042-1.563 1.5-1.94a3.999 3.999 0 0 1 1.378-.737C15.547 18 16.173 18 17.425 18H18.8c1.12 0 1.68 0 2.108-.218a2 2 0 0 0 .874-.874C22 16.48 22 15.92 22 14.8V6.2c0-1.12 0-1.68-.218-2.108a2 2 0 0 0-.874-.874C20.48 3 19.92 3 18.8 3h-.4c-2.24 0-3.36 0-4.216.436a4 4 0 0 0-1.748 1.748C12 6.04 12 7.16 12 9.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  talk: `<svg viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.5 8.5 0 0 1-11.555 7.934c-.174-.066-.26-.1-.33-.116a.901.901 0 0 0-.186-.024 2.314 2.314 0 0 0-.303.021l-5.12.53c-.49.05-.733.075-.877-.013a.5.5 0 0 1-.234-.35c-.026-.166.09-.382.324-.814l1.636-3.027c.134-.25.202-.374.232-.494a.899.899 0 0 0 .028-.326c-.01-.123-.064-.283-.172-.604A8.5 8.5 0 1 1 21 11.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none"><path d="M22 21v-2a4.002 4.002 0 0 0-3-3.874M15.5 3.291a4.001 4.001 0 0 1 0 7.418M17 21c0-1.864 0-2.796-.305-3.53a4 4 0 0 0-2.164-2.165C13.796 15 12.864 15 11 15H8c-1.864 0-2.796 0-3.53.305a4 4 0 0 0-2.166 2.164C2 18.204 2 19.136 2 21M13.5 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none"><path d="M8.4 3H4.6c-.56 0-.84 0-1.054.109a1 1 0 0 0-.437.437C3 3.76 3 4.04 3 4.6v3.8c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C3.76 10 4.04 10 4.6 10h3.8c.56 0 .84 0 1.054-.109a1 1 0 0 0 .437-.437C10 9.24 10 8.96 10 8.4V4.6c0-.56 0-.84-.109-1.054a1 1 0 0 0-.437-.437C9.24 3 8.96 3 8.4 3Zm11 0h-3.8c-.56 0-.84 0-1.054.109a1 1 0 0 0-.437.437C14 3.76 14 4.04 14 4.6v3.8c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C14.76 10 15.04 10 15.6 10h3.8c.56 0 .84 0 1.054-.109a1 1 0 0 0 .437-.437C21 9.24 21 8.96 21 8.4V4.6c0-.56 0-.84-.109-1.054a1 1 0 0 0-.437-.437C20.24 3 19.96 3 19.4 3Zm0 11h-3.8c-.56 0-.84 0-1.054.109a1 1 0 0 0-.437.437C14 14.76 14 15.04 14 15.6v3.8c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C14.76 21 15.04 21 15.6 21h3.8c.56 0 .84 0 1.054-.109a1 1 0 0 0 .437-.437C21 20.24 21 19.96 21 19.4v-3.8c0-.56 0-.84-.109-1.054a1 1 0 0 0-.437-.437C20.24 14 19.96 14 19.4 14Zm-11 0H4.6c-.56 0-.84 0-1.054.109a1 1 0 0 0-.437.437C3 14.76 3 15.04 3 15.6v3.8c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C3.76 21 4.04 21 4.6 21h3.8c.56 0 .84 0 1.054-.109a1 1 0 0 0 .437-.437C10 20.24 10 19.96 10 19.4v-3.8c0-.56 0-.84-.109-1.054a1 1 0 0 0-.437-.437C9.24 14 8.96 14 8.4 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none"><path d="m2 7 8.165 5.715c.661.463.992.695 1.351.784a2 2 0 0 0 .968 0c.36-.09.69-.32 1.351-.784L22 7M6.8 20h10.4c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.311-1.311C22 17.72 22 16.88 22 15.2V8.8c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C19.72 4 18.88 4 17.2 4H6.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C2 6.28 2 7.12 2 8.8v6.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C4.28 20 5.12 20 6.8 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 22v-5m0-10V2M2 4.5h5m-5 15h5M13 3l-1.734 4.509c-.282.733-.423 1.1-.643 1.408a3 3 0 0 1-.706.707c-.308.219-.675.36-1.408.642L4 12l4.509 1.734c.733.282 1.1.423 1.408.643.273.194.512.433.707.706.219.308.36.675.642 1.408L13 21l1.734-4.509c.282-.733.423-1.1.643-1.408.194-.273.433-.512.706-.707.308-.219.675-.36 1.408-.642L22 12l-4.509-1.734c-.733-.282-1.1-.423-1.408-.642a3 3 0 0 1-.706-.707c-.22-.308-.36-.675-.643-1.408L13 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2M6.7 6.8C4 8.3 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.7-1.3M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5m0 0-6 6m6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrowDown: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14m0 0 6-6m-6 6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  smiley: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/></svg>`,
  paperclip: `<svg viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none"><path d="m8 16 4-4m0 0 4 4m-4-4v9m8-4.257A5.5 5.5 0 0 0 16.5 7a.62.62 0 0 1-.534-.302 7.5 7.5 0 1 0-11.78 9.096" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none"><path d="M15.05 9H5.5a2.5 2.5 0 0 1 0-5h9.55m-6.1 16h9.55a2.5 2.5 0 0 0 0-5H8.95M3 17.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0Zm18-11a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none"><path d="m16 17 5-5m0 0-5-5m5 5H9m0-9H7.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C3 5.28 3 6.12 3 7.8v8.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C5.28 21 6.12 21 7.8 21H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none"><path d="M21 10H3m13-8v4M8 2v4m-.2 16h8.4c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.311-1.311C21 19.72 21 18.88 21 17.2V8.8c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C18.72 4 17.88 4 16.2 4H7.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C3 6.28 3 7.12 3 8.8v8.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C5.28 22 6.12 22 7.8 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none"><path d="M17 10V8A5 5 0 0 0 7 8v2m5 4.5v2M8.8 21h6.4c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.311-1.311C20 18.72 20 17.88 20 16.2v-1.4c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C17.72 10 16.88 10 15.2 10H8.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C4 12.28 4 13.12 4 14.8v1.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C6.28 21 7.12 21 8.8 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M3 20h1.675c.489 0 .733 0 .964-.055.204-.05.399-.13.578-.24.201-.123.374-.296.72-.642L19.5 6.5a2.121 2.121 0 0 0-3-3L3.937 16.063c-.346.346-.519.519-.642.72a2 2 0 0 0-.24.578c-.055.23-.055.475-.055.965V20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none"><path d="M19 10v1a7 7 0 0 1-14 0v-1m7 8v4m0-4a4 4 0 0 1-4-4V6a4 4 0 1 1 8 0v8a4 4 0 0 1-4 4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none"><path d="M8 7h8M8 11h8M8 15h4m-4 6h8.2c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.311-1.311C21 18.72 21 17.88 21 16.2V7.8c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C18.72 3 17.88 3 16.2 3H7.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C3 5.28 3 6.12 3 7.8v8.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C5.28 21 6.12 21 7.8 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none"><path d="m17 9.5 3.223-2.148c.402-.268.603-.402.769-.395a.5.5 0 0 1 .372.195c.103.13.103.372.103.856v7.984c0 .484 0 .726-.103.856a.5.5 0 0 1-.372.195c-.166.007-.367-.127-.769-.395L17 14.5m-11.8 4h7.6c1.12 0 1.68 0 2.108-.218a2 2 0 0 0 .874-.874C16 16.98 16 16.42 16 15.3V8.7c0-1.12 0-1.68-.218-2.108a2 2 0 0 0-.874-.874C14.48 5.5 13.92 5.5 12.8 5.5H5.2c-1.12 0-1.68 0-2.108.218a2 2 0 0 0-.874.874C2 7.02 2 7.58 2 8.7v6.6c0 1.12 0 1.68.218 2.108a2 2 0 0 0 .874.874c.428.218.988.218 2.108.218Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  library: `<svg viewBox="0 0 24 24" fill="none"><path d="M22 19V8.2c0-1.12 0-1.68-.218-2.108a2 2 0 0 0-.874-.874C20.48 5 19.92 5 18.8 5h-4.024c-.489 0-.733 0-.963-.055a2 2 0 0 1-.578-.24c-.201-.123-.374-.296-.72-.642l-.03-.03c-.346-.346-.519-.519-.72-.642a2 2 0 0 0-.579-.24C10.957 3.15 10.713 3.15 10.224 3.15H5.2c-1.12 0-1.68 0-2.108.218a2 2 0 0 0-.874.874C2 4.67 2 5.23 2 6.35V19m20 0a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2m20 0-2.5-6.5M2 19l2.5-6.5m3 0h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  board: `<svg viewBox="0 0 24 24" fill="none"><path d="M7 9h6m-6 4h9m-9.2 7 2.494 2.494c.253.253.38.38.524.427a.7.7 0 0 0 .432 0c.145-.047.271-.174.524-.427L13 20h2.2c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.311-1.311C20 17.72 20 16.88 20 15.2V6.8c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C17.72 2 16.88 2 15.2 2H6.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C2 4.28 2 5.12 2 6.8v8.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C4.28 20 5.12 20 6.8 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none"><path d="M14 7h1.5a4.5 4.5 0 1 1 0 9H14m-4 0H8.5a4.5 4.5 0 1 1 0-9H10m-1.5 4.5h7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 15v7m-2.879-8.879 1.293-1.293c.2-.2.3-.3.363-.418a1 1 0 0 0 .107-.34c.014-.132-.006-.27-.045-.548l-.34-2.377c-.05-.354-.076-.53-.043-.702a1 1 0 0 1 .155-.375c.098-.145.245-.254.539-.474l2.35-1.762c.35-.263.526-.394.62-.567a1 1 0 0 0 .116-.549c-.016-.196-.12-.39-.33-.777l-.128-.236c-.192-.354-.288-.53-.433-.64a1 1 0 0 0-.457-.187c-.18-.026-.37.02-.752.114L6.4 3.86c-.53.13-.795.195-.96.348a1 1 0 0 0-.31.63c-.02.223.096.469.328.96l.101.215c.18.38.27.571.41.7a1 1 0 0 0 .43.234c.184.045.392.02.807-.03l2.31-.28c.29-.036.436-.054.572-.032a1 1 0 0 1 .38.15c.116.076.213.19.407.417l1.192 1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  /* The like. Outline until it is pressed, when CSS fills it — one shape doing
     both states keeps the button from changing size as it is clicked. */
  heart: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 7.694c-1.4-1.6-3.2-2.2-4.9-1.7-2.4.7-3.6 3.3-2.8 5.7.9 2.9 4.4 5.6 7.7 7.6 3.3-2 6.8-4.7 7.7-7.6.8-2.4-.4-5-2.8-5.7-1.7-.5-3.5.1-4.9 1.7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  comment: `<svg viewBox="0 0 24 24" fill="none"><path d="M8 10.5h8M8 14h5m-6.2 6L9.3 22.5c.25.25.38.38.52.43a.7.7 0 0 0 .43 0c.15-.05.27-.18.52-.43L13 20h2.2c1.68 0 2.52 0 3.16-.33a3 3 0 0 0 1.31-1.31C20 17.72 20 16.88 20 15.2V6.8c0-1.68 0-2.52-.33-3.16a3 3 0 0 0-1.31-1.31C17.72 2 16.88 2 15.2 2H6.8c-1.68 0-2.52 0-3.16.33a3 3 0 0 0-1.31 1.31C2 4.28 2 5.12 2 6.8v8.4c0 1.68 0 2.52.33 3.16a3 3 0 0 0 1.31 1.31C4.28 20 5.12 20 6.8 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cap: `<svg viewBox="0 0 24 24" fill="none"><path d="M2.5 8.5 12 4l9.5 4.5L12 13 2.5 8.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6.5 10.7v4.6c0 .6.3 1.1.8 1.4 1.2.7 2.9 1.3 4.7 1.3s3.5-.6 4.7-1.3c.5-.3.8-.8.8-1.4v-4.6M21 9v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  cloudUp: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 16V9m0 0-3 3m3-3 3 3M6.5 19a4.5 4.5 0 0 1-.42-8.98 6 6 0 0 1 11.65-1.9A4.75 4.75 0 0 1 17.5 19H6.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none"><path d="M15 5V4.2c0-.84 0-1.26-.16-1.58a1.5 1.5 0 0 0-.66-.66C13.86 1.8 13.44 1.8 12.6 1.8h-1.2c-.84 0-1.26 0-1.58.16a1.5 1.5 0 0 0-.66.66C9 2.94 9 3.36 9 4.2V5m2 5.5v5m2-5v5M3.5 5h17m-1.7 0v11.4c0 1.26 0 1.89-.25 2.37a2.25 2.25 0 0 1-.98.98c-.48.25-1.11.25-2.37.25H8.8c-1.26 0-1.89 0-2.37-.25a2.25 2.25 0 0 1-.98-.98c-.25-.48-.25-1.11-.25-2.37V5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  tick: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8 12.2l2.6 2.6L16 9.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  smile: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.3" stroke="currentColor" stroke-width="2"/><path d="M8.4 14.2a4.4 4.4 0 0 0 7.2 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="10" r="1.15" fill="currentColor"/><circle cx="15" cy="10" r="1.15" fill="currentColor"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="2"/><path d="M10 8.6v6.8l5.5-3.4L10 8.6Z" fill="currentColor"/></svg>`,
  camera2: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 9.5A2.5 2.5 0 0 1 5.5 7h1.2c.5 0 .95-.28 1.17-.72l.66-1.31A1.5 1.5 0 0 1 9.87 4h4.26c.57 0 1.09.32 1.34.83l.66 1.31c.22.44.68.86 1.17.86h1.2A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="2"/></svg>`,
};

/* ------------------------------------------------------------------
   Voice: recording, dictation and voice notes.

   One recorder drives both features. Dictation sends the audio to the server,
   which transcribes and cleans it and returns text — the same pipeline as the
   VoiceKey keyboard, so both tools produce the same voice. A voice note keeps
   the audio itself and attaches it to the returned feedback.
   ------------------------------------------------------------------ */

/** Formats a duration the way a voice message does: 0:07, 1:24. */
function fmtDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The best container this browser will actually produce. Safari only does mp4. */
function preferredAudioType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function voiceSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

/**
 * A single active recording. Only one runs at a time so two microphones can never
 * compete, and the track is always stopped so the browser's recording indicator
 * goes away even when something throws.
 */
let activeRecorder = null;

async function startRecording({ onTick, onLevel } = {}) {
  if (!voiceSupported()) throw new Error('This browser cannot record audio. Try Chrome, Edge or Safari.');
  if (activeRecorder) await activeRecorder.stop().catch(() => {});

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      throw new Error('Microphone access was blocked. Allow it for this site in your browser settings, then try again.');
    }
    if (error.name === 'NotFoundError') throw new Error('No microphone was found.');
    throw new Error('The microphone could not be started.');
  }

  const mimeType = preferredAudioType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  const startedAt = Date.now();
  recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) chunks.push(event.data); });

  // Live level meter, so it is obvious the microphone is actually hearing something.
  let audioContext = null, levelTimer = null;
  if (onLevel && typeof AudioContext !== 'undefined') {
    try {
      audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const value of data) peak = Math.max(peak, Math.abs(value - 128));
        onLevel(Math.min(1, peak / 60));
      }, 100);
    } catch { audioContext = null; }
  }

  const tickTimer = onTick ? setInterval(() => onTick((Date.now() - startedAt) / 1000), 250) : null;
  const cleanUp = () => {
    clearInterval(tickTimer); clearInterval(levelTimer);
    stream.getTracks().forEach((track) => track.stop());
    audioContext?.close().catch(() => {});
    if (activeRecorder?.handle === recorder) activeRecorder = null;
  };

  recorder.start();

  const handle = {
    handle: recorder,
    get seconds() { return (Date.now() - startedAt) / 1000; },
    cancel() { try { recorder.stop(); } catch {} cleanUp(); },
    stop() {
      return new Promise((resolve, reject) => {
        recorder.addEventListener('error', (event) => { cleanUp(); reject(event.error || new Error('Recording failed.')); }, { once: true });
        recorder.addEventListener('stop', () => {
          const seconds = (Date.now() - startedAt) / 1000;
          cleanUp();
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
          if (!blob.size) return reject(new Error('Nothing was recorded.'));
          resolve({ blob, seconds });
        }, { once: true });
        try { recorder.stop(); } catch (error) { cleanUp(); reject(error); }
      });
    },
  };
  activeRecorder = handle;
  return handle;
}

function audioFileName(blob) {
  const base = String(blob.type).split(';')[0];
  return `recording${{ 'audio/webm': '.webm', 'audio/mp4': '.mp4', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/wav': '.wav' }[base] || '.webm'}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

const FALLBACK_TIMEZONE = 'Europe/Dublin';

/* Deadlines belong to the class, not to whoever happens to be looking at them.
   Everything is formatted in the class timezone so a teacher marking work abroad
   sees the same closing time as the students it applies to. */
function classTimezone() {
  return state.tracker?.class?.timezone || state.studentData?.class?.timezone || FALLBACK_TIMEZONE;
}

function timezoneOffsetMinutes(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/** ISO instant to the "YYYY-MM-DDTHH:mm" a datetime-local input expects, read in the class timezone. */
function toZonedInput(value, timeZone = classTimezone()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() + timezoneOffsetMinutes(date, timeZone) * 60000).toISOString().slice(0, 16);
}

/** The reverse: a wall-clock value typed into a datetime-local input, read in the class timezone. */
function fromZonedInput(text, timeZone = classTimezone()) {
  const naive = new Date(`${text}:00Z`).getTime();
  if (!Number.isFinite(naive)) return new Date().toISOString();
  let instant = naive - timezoneOffsetMinutes(new Date(naive), timeZone) * 60000;
  instant = naive - timezoneOffsetMinutes(new Date(instant), timeZone) * 60000;
  return new Date(instant).toISOString();
}

/* Intl refuses to mix the dateStyle/timeStyle shorthands with individual
   components, so the weekday variant spells every field out. */
function fmtDate(value, options = {}) {
  if (!value) return '—';
  const timeZone = options.timeZone || classTimezone();
  if (options.timeOnly) {
    return new Intl.DateTimeFormat('en-IE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(value));
  }
  const format = options.weekday
    ? {
        weekday: 'short', day: 'numeric', month: 'short',
        ...(options.dateStyle === 'short' ? {} : { year: 'numeric' }),
        ...(options.time ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
      }
    : {
        dateStyle: options.dateStyle || 'medium',
        ...(options.time ? { timeStyle: 'short' } : {}),
      };
  // en-IE puts a comma after the weekday, which reads badly next to the one
  // before the time: "Sun, 19 Jul, 20:00" becomes "Sun 19 Jul, 20:00".
  return new Intl.DateTimeFormat('en-IE', { ...format, timeZone }).format(new Date(value)).replace(/^(\p{L}{2,4}),\s/u, '$1 ');
}

/* week_start is a calendar day ("2026-07-20"). Older records may still arrive as
   a full timestamp, so take the date part either way and read it as UTC noon,
   which keeps the day stable in every timezone. */
function fmtWeek(value) {
  if (!value) return '';
  const day = String(value).slice(0, 10);
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function timezoneAbbreviation(timeZone = classTimezone()) {
  const parts = new Intl.DateTimeFormat('en-IE', { timeZone, timeZoneName: 'short' }).formatToParts(new Date());
  return parts.find((part) => part.type === 'timeZoneName')?.value || '';
}

function classLabel(row) {
  if (!row) return '';
  return row.label || `${row.programme_name} | ${DAY_NAMES[Number(row.day_of_week)]} | ${String(row.start_time).slice(0, 5)}`;
}

function showToast(message, type = '', undo = null) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  // An action gets longer on screen, because it is no use if it vanishes first.
  if (undo) {
    const button = document.createElement('button');
    button.className = 'toast-action';
    button.textContent = undo.label;
    button.addEventListener('click', () => { toast.remove(); undo.action(); });
    toast.append(button);
  }
  toastRoot.append(toast);
  setTimeout(() => toast.remove(), undo ? 7000 : 3200);
}

const wantsStillness = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Handing work in should feel like something. Drawn here rather than pulled from
   a library because the content security policy blocks outside hosts, and a
   celebration that depends on the network is one that fails when the wifi does. */
function celebrate({ big = false } = {}) {
  if (wantsStillness()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);

  const context = canvas.getContext('2d');
  const density = Math.min(window.devicePixelRatio || 1, 2);
  const fit = () => {
    canvas.width = window.innerWidth * density;
    canvas.height = window.innerHeight * density;
    context.setTransform(density, 0, 0, density, 0, 0);
  };
  fit();
  window.addEventListener('resize', fit);

  const COLOURS = ['#50AF37', '#17b26a', '#067647', '#f79009', '#dcfae6', '#ffffff'];
  const pieces = [];
  const burst = (x, y, count, power) => {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.45 + Math.random() * 0.85);
      pieces.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - power * 0.55,
        width: 5 + Math.random() * 6,
        height: 8 + Math.random() * 7,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.32,
        life: 1,
        fade: 0.006 + Math.random() * 0.006,
      });
    }
  };

  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = big ? 1.5 : 1;
  burst(width * 0.5, height * 0.42, Math.round(70 * scale), 11);
  setTimeout(() => burst(width * 0.14, height * 0.72, Math.round(45 * scale), 13), 130);
  setTimeout(() => burst(width * 0.86, height * 0.72, Math.round(45 * scale), 13), 220);
  if (big) setTimeout(() => burst(width * 0.5, height * 0.3, 60, 12), 380);

  let frame;
  const tick = () => {
    context.clearRect(0, 0, width, height);
    for (let index = pieces.length - 1; index >= 0; index -= 1) {
      const piece = pieces[index];
      piece.vy += 0.24;          // gravity
      piece.vx *= 0.99;          // air
      piece.vy *= 0.99;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rotation += piece.spin;
      piece.life -= piece.fade;
      if (piece.life <= 0 || piece.y > height + 60) { pieces.splice(index, 1); continue; }
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, piece.life));
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.colour;
      context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
      context.restore();
    }
    if (pieces.length) { frame = requestAnimationFrame(tick); return; }
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', fit);
    canvas.remove();
  };
  frame = requestAnimationFrame(tick);
}

async function api(url, options = {}) {
  const config = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
  if (config.body && !(config.body instanceof FormData) && typeof config.body !== 'string') {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(url, config);
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    /* The server refuses everything until a student has added a photograph.
       Wherever that is hit, the answer is the same: take them to the step that
       clears it rather than showing whichever screen half-loaded. */
    if (response.status === 428 && data.code === 'avatar_required') {
      if (state.user) { state.user.mustSetAvatar = true; state.user.hasAvatar = false; }
      renderAuth('avatar');
    }
    const error = new Error(data.error || 'Something went wrong.');
    error.status = response.status;
    throw error;
  }
  return data;
}

/* The logo already carries the Gaeilgeoir Guides wordmark, so the lockup pairs it
   with the product name rather than repeating the company name in text.
   On the dark sign-in panel it sits on a white chip, because the artwork has a
   navy and green palette that disappears against the green ground. */
const LOGO_SRC = window.__GG_LOGO__ || '/logo.webp';

function brandLockup(large = false, onDark = false) {
  return `<div class="brand-lockup ${large ? 'large' : ''} ${onDark ? 'on-dark' : ''}">
    <img class="brand-logo" src="${LOGO_SRC}" alt="Gaeilgeoir Guides">
    <span class="brand-sub">Class<br>Portal</span>
  </div>`;
}

/* `bare` is for a dialog that supplies its own header — the post composer puts
   the author and the category up there, and a second title bar above that would
   be one row of chrome doing nothing. */
function modal({ title, subtitle = '', body, footer = '', wide = false, bare = false, onOpen }) {
  modalRoot.innerHTML = `
    <div class="overlay open" data-close-modal></div>
    <section class="modal open ${wide ? 'wide' : ''} ${bare ? 'bare' : ''}" role="dialog" aria-modal="true">
      ${bare ? '' : `<header class="modal-head"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="close" aria-label="Close" data-close-modal>${svg.x}</button></header>`}
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}
    </section>`;
  modalRoot.querySelectorAll('[data-close-modal]').forEach((element) => element.addEventListener('click', closeModal));
  onOpen?.(modalRoot.querySelector('.modal'));
}


/* The browser's own confirm() is blocked inside sandboxed iframes — the call just
   returns false and the action silently does nothing, with no error to explain
   it. This asks in the page instead, so a confirmation always appears and always
   looks like the rest of the application. It sits in its own layer above
   whatever is already open, so a half-written note or draft survives the answer. */
function askConfirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'confirm-layer';
    layer.innerHTML = `
      <div class="overlay open" data-confirm-cancel></div>
      <section class="modal open confirm-modal" role="alertdialog" aria-modal="true">
        <header class="modal-head"><div><h2>${escapeHtml(title)}</h2></div></header>
        <div class="modal-body"><p class="confirm-message">${escapeHtml(message)}</p></div>
        <footer class="modal-footer">
          <button class="btn" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-confirm-ok>${escapeHtml(confirmLabel)}</button>
        </footer>
      </section>`;
    const settle = (answer) => {
      document.removeEventListener('keydown', onKey, true);
      layer.remove();
      resolve(answer);
    };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      settle(false);
    };
    document.addEventListener('keydown', onKey, true);
    layer.querySelectorAll('[data-confirm-cancel]').forEach((element) => element.addEventListener('click', () => settle(false)));
    layer.querySelector('[data-confirm-ok]').addEventListener('click', () => settle(true));
    document.body.append(layer);
    layer.querySelector('[data-confirm-ok]').focus();
  });
}

function closeModal() {
  modalRoot.innerHTML = '';
  state.checkinForm = null;
  state.homeworkForm = null;
}

/* A drawer without a footer is a drawer whose actions sit inline in the body,
   which is how the board reads. Defaulting to an empty string keeps that case
   from printing the word "undefined" along the bottom edge. */
function openDrawer({ title, subtitle, body, footer = '', onOpen }) {
  modalRoot.innerHTML = `
    <div class="overlay open" data-close-drawer></div>
    <aside class="drawer open">
      <header class="drawer-head"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button class="close" aria-label="Close" data-close-drawer>${svg.x}</button></header>
      <div class="drawer-body">${body}</div>
      ${footer ? `<footer class="drawer-footer">${footer}</footer>` : ''}
    </aside>`;
  modalRoot.querySelectorAll('[data-close-drawer]').forEach((element) => element.addEventListener('click', closeModal));
  onOpen?.(modalRoot.querySelector('.drawer'));
}

/* One status tile: a fixed 32px icon over a single line of label text.
   The two sit in fixed grid rows so every tile in a row shares a baseline no
   matter how long the label is. `hint` becomes the hover tooltip. */
function statusIcon({ tone, icon, label, hint, unread = false }) {
  const title = hint || label;
  const badge = unread ? '<span class="unread-badge" aria-label="1 new">1</span>' : '';
  return `<span class="status-icon ${tone}">${svg[icon] || ''}${badge}</span><span class="status-label" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

/* A dictate button that sits above a textarea. `mode` is 'light' for the Irish
   corrections box, where the cleanup model must not touch the Irish being taught. */
/* Dictation is a teacher tool and must never appear on a student screen. The
   gate lives here rather than at each call site so that adding a dictate button
   to something a student can see is not possible by accident: the button simply
   does not render for them. Students are never shown anything — a control, a
   label, a field in an API response — implying their feedback was drafted by a
   model. */
function dictateButton(targetId, mode = 'full') {
  if (state.user?.role !== 'admin') return '';
  if (!voiceSupported()) return '';
  return `<button type="button" class="dictate-btn" data-dictate-for="${targetId}" data-dictate-mode="${mode}" title="Dictate this${mode === 'light' ? '. Irish wording is left exactly as you say it.' : ''}">
    ${svg.mic}<span class="dictate-label">Dictate</span><span class="dictate-timer"></span>
  </button>`;
}

/** Wires every dictate button currently on screen. Safe to call after any render. */
function bindDictation(root = document) {
  root.querySelectorAll('[data-dictate-for]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => toggleDictation(button));
  });
}

async function toggleDictation(button) {
  const target = document.getElementById(button.dataset.dictateFor);
  if (!target) return;
  const label = button.querySelector('.dictate-label');
  const timer = button.querySelector('.dictate-timer');

  if (button.dataset.state === 'recording') {
    const recorder = button.__recorder;
    button.dataset.state = 'working';
    button.classList.remove('is-recording');
    button.classList.add('is-working');
    label.textContent = 'Transcribing';
    timer.textContent = '';
    try {
      const { blob, seconds } = await recorder.stop();
      if (seconds < 0.6) throw new Error('That recording was too short.');
      const form = new FormData();
      form.append('audio', blob, audioFileName(blob));
      form.append('mode', button.dataset.dictateMode || 'full');
      const result = await api('/api/admin/dictate', { method: 'POST', body: form });
      insertDictatedText(target, result.text);
      showToast(result.cleaned ? 'Dictation added' : 'Dictation added without cleanup', result.cleaned ? '' : 'error');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.dataset.state = '';
      button.classList.remove('is-working');
      label.textContent = 'Dictate';
      button.__recorder = null;
    }
    return;
  }

  try {
    button.__recorder = await startRecording({
      onTick: (seconds) => { timer.textContent = fmtDuration(seconds); },
    });
    button.dataset.state = 'recording';
    button.classList.add('is-recording');
    label.textContent = 'Stop';
    timer.textContent = '0:00';
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/** Drops dictated text in at the cursor, keeping a sensible space or blank line. */
function insertDictatedText(target, text) {
  if (!text) return;
  const before = target.value.slice(0, target.selectionStart ?? target.value.length);
  const after = target.value.slice(target.selectionEnd ?? target.value.length);
  const needsGap = before.trim() && !/\n\s*$/.test(before);
  const joined = `${before}${needsGap ? (before.endsWith(' ') ? '' : ' ') : ''}${text}${after ? '' : ''}`;
  target.value = joined + after;
  const caret = joined.length;
  target.focus();
  target.setSelectionRange(caret, caret);
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

/* The voice note block in the review drawer: record, play back, re-record, remove.
   A note can carry the whole reply, so the written boxes may be left empty. */
function voiceNoteBlock(record) {
  const type = record.type === 'checkin' ? 'checkin' : 'homework';
  const row = type === 'checkin' ? record.checkin : record.homework;
  const note = row?.voice_note;
  if (!voiceSupported() && !note) {
    return '<div class="voice-note-card"><div class="muted small">This browser cannot record audio, so voice notes are unavailable here.</div></div>';
  }
  return `<div class="voice-note-card" id="voice-note-card" data-voice-type="${type}" data-voice-id="${row.id}">
    <div class="voice-note-head">
      <span class="voice-note-title">${svg.mic} Voice note</span>
      <span class="muted small" id="voice-note-hint">${note ? `Recorded ${escapeHtml(fmtDate(note.recordedAt, { time: true, weekday: true, dateStyle: 'short' }))}` : 'Optional. Students hear this alongside your written feedback.'}</span>
    </div>
    <div class="voice-note-body" id="voice-note-body">${note ? voiceNotePlayer(note, true) : voiceNoteRecorder()}</div>
  </div>`;
}

function voiceNotePlayer(note, admin = false) {
  return `<div class="voice-player">
    <audio controls preload="none" src="${escapeHtml(note.url)}"></audio>
    <span class="voice-length">${fmtDuration(note.seconds)}</span>
    ${admin ? '<button type="button" class="btn small" id="voice-note-rerecord">Re-record</button><button type="button" class="btn small danger" id="voice-note-delete">Remove</button>' : ''}
  </div>`;
}

function voiceNoteRecorder() {
  return `<div class="voice-recorder">
    <button type="button" class="btn record-btn" id="voice-note-record">${svg.mic} Record a voice note</button>
    <span class="record-status" id="voice-note-status"></span>
    <span class="level-meter" id="voice-note-level"><i></i></span>
  </div>`;
}

let voiceNoteRecording = null;

function bindVoiceNote() {
  const card = document.getElementById('voice-note-card');
  if (!card) return;
  const body = document.getElementById('voice-note-body');
  const type = card.dataset.voiceType;
  const id = card.dataset.voiceId;

  document.getElementById('voice-note-rerecord')?.addEventListener('click', () => {
    body.innerHTML = voiceNoteRecorder();
    bindVoiceNote();
  });

  document.getElementById('voice-note-delete')?.addEventListener('click', async () => {
    if (!await askConfirm({ title: 'Remove this voice note?', message: 'The recording is deleted and the student will no longer hear it.', confirmLabel: 'Remove', danger: true })) return;
    try {
      const row = await api(`/api/admin/voice-note/${type}/${id}`, { method: 'DELETE' });
      applyVoiceNoteRow(row);
      body.innerHTML = voiceNoteRecorder();
      document.getElementById('voice-note-hint').textContent = 'Optional. Students hear this alongside your written feedback.';
      bindVoiceNote();
      showToast('Voice note removed');
    } catch (error) { showToast(error.message, 'error'); }
  });

  const button = document.getElementById('voice-note-record');
  if (!button) return;
  const status = document.getElementById('voice-note-status');
  const level = document.getElementById('voice-note-level');

  button.addEventListener('click', async () => {
    if (voiceNoteRecording) {
      button.disabled = true;
      status.textContent = 'Saving…';
      level.classList.remove('is-live');
      try {
        const { blob, seconds } = await voiceNoteRecording.stop();
        voiceNoteRecording = null;
        if (seconds < 0.6) throw new Error('That recording was too short.');
        const form = new FormData();
        form.append('audio', blob, audioFileName(blob));
        form.append('seconds', String(Math.round(seconds)));
        const row = await api(`/api/admin/voice-note/${type}/${id}`, { method: 'POST', body: form });
        applyVoiceNoteRow(row);
        body.innerHTML = voiceNotePlayer(row.voice_note, true);
        document.getElementById('voice-note-hint').textContent = `Recorded ${fmtDate(row.voice_note.recordedAt, { time: true, weekday: true, dateStyle: 'short' })}`;
        bindVoiceNote();
        showToast('Voice note saved');
      } catch (error) {
        voiceNoteRecording = null;
        showToast(error.message, 'error');
        button.disabled = false;
        button.classList.remove('is-recording');
        button.innerHTML = `${svg.mic} Record a voice note`;
        status.textContent = '';
      }
      return;
    }
    try {
      voiceNoteRecording = await startRecording({
        onTick: (seconds) => { status.textContent = fmtDuration(seconds); },
        onLevel: (value) => { level.style.setProperty('--level', value.toFixed(2)); },
      });
      level.classList.add('is-live');
      button.classList.add('is-recording');
      button.innerHTML = `${svg.stop} Stop recording`;
      status.textContent = '0:00';
    } catch (error) { showToast(error.message, 'error'); }
  });
}

/** Keeps the in-memory tracker row in step with the server after a voice-note change. */
function applyVoiceNoteRow(row) {
  const record = state.activeReview;
  if (!record) return;
  const target = record.type === 'checkin' ? record.checkin : record.homework;
  if (target) Object.assign(target, row);
}

function effectiveDeadline(assignment) {
  const deadline = new Date(assignment.deadline_at).getTime();
  const reopened = assignment.reopened_until ? new Date(assignment.reopened_until).getTime() : 0;
  return Math.max(deadline, reopened || 0);
}

/* Work is still open when the deadline is soft, whatever the clock says. Showing
   it as missed while the server would still accept the submission is worse than
   showing it as late. */
function assignmentClosed(assignment, now = Date.now()) {
  return assignment.hard_deadline !== false && now > effectiveDeadline(assignment);
}

function attendanceState(attendance) {
  if (attendance?.status === 'live') return { tone: 'green', icon: 'camera', label: 'Live', hint: 'Attended live' };
  if (!attendance || attendance.status === 'unknown') return { tone: 'grey', icon: 'camera', label: 'No record', hint: 'No attendance recorded for this week yet' };
  return { tone: 'red', icon: 'x', label: 'Not live', hint: 'Did not attend live. Watching the recording does not count.' };
}

/* Student-facing colours. Orange is reserved for the teacher's own tracker, where
   it means "this is waiting on you". From a student's side, handing work in is a
   good outcome, so submitted is green and the label carries the difference. */
function homeworkState(submission, assignment, now = Date.now()) {
  // A soft deadline accepts late work and says so rather than hiding it.
  if (submission?.submitted_late && submission.status !== 'draft') {
    return submission.status === 'returned'
      ? { tone: 'green', icon: 'book', label: 'Returned', hint: 'Handed in late, and marked' }
      : { tone: 'green', icon: 'book', label: 'Submitted late', hint: 'Handed in after the deadline' };
  }
  if (submission?.status === 'returned') return { tone: 'green', icon: 'book', label: 'Returned', hint: 'Corrections and feedback have been returned. Open it to read them.' };
  if (submission?.status === 'submitted') return { tone: 'green', icon: 'book', label: 'Submitted', hint: 'Submitted. Open it to see what you sent.' };
  if (assignmentClosed(assignment, now)) return { tone: 'red', icon: 'x', label: 'Missed', hint: 'The deadline passed without a submission' };
  if (now > effectiveDeadline(assignment)) return { tone: 'grey', icon: 'book', label: 'Open, late', hint: 'Past the deadline but still accepting submissions' };
  return { tone: 'grey', icon: 'book', label: 'To do', hint: 'Open and not submitted yet' };
}

function checkinState(checkin, week, now = Date.now()) {
  if (checkin?.status === 'returned') return { tone: 'green', icon: 'talk', label: 'Returned', hint: 'Your teacher has replied. Open it to read the reply.' };
  if (checkin?.status === 'submitted') return { tone: 'green', icon: 'talk', label: 'Submitted', hint: 'Submitted. Open it to see what you sent.' };
  if (week.checkin_enabled === false) return { tone: 'grey', icon: 'talk', label: 'Off', hint: 'No check-in was set for this week' };
  if (now > new Date(week.checkin_due_at).getTime()) {
    // A soft deadline keeps accepting late check-ins, so it is not a miss.
    return week.checkin_hard_deadline === false
      ? { tone: 'grey', icon: 'talk', label: 'Open, late', hint: 'Past the deadline but still accepting check-ins' }
      : { tone: 'red', icon: 'x', label: 'Missed', hint: 'The check-in deadline passed without a submission' };
  }
  return { tone: 'grey', icon: 'talk', label: 'To do', hint: 'Open and not submitted yet' };
}

/* Authentication */
function renderAuth(mode = 'login', message = '') {
  const resetToken = new URLSearchParams(location.search).get('reset');
  if (resetToken) mode = 'reset';
  const copy = {
    login: ['Welcome back', 'Sign in to see your class, your homework and your feedback.'],
    forgot: ['Reset your password', 'Enter your email and we will send a secure reset link.'],
    reset: ['Choose a new password', 'This reset link expires after one hour.'],
    change: ['Protect your account', 'Choose your own strong password before continuing.'],
    avatar: ['Add your photograph', 'One more thing, then you are in.'],
  }[mode];
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-art">
        ${brandLockup(false, true)}
        <div class="auth-copy">
          <h1>Class Portal</h1>
          <p>Everything for your Irish course in one place: your class, your weekly check-in, your homework, and the corrections and feedback that come back to you.</p>
          <div class="auth-feature-list">
            <div class="auth-feature"><span>✓</span><span>See what is due and when, and work through it one question at a time.</span></div>
            <div class="auth-feature"><span>✓</span><span>Your answers save as you go, so you can stop and pick it up later.</span></div>
            <div class="auth-feature"><span>✓</span><span>Read your corrections and listen back to your teacher's voice notes.</span></div>
          </div>
        </div>
        <figure class="auth-proverb">
          <blockquote lang="ga">Tá Gaeilge bhriste níos fearr ná Béarla cliste!</blockquote>
          <figcaption>Broken Irish is better than clever English.</figcaption>
        </figure>
      </section>
      <section class="auth-form-side">
        <div class="auth-card">
          ${brandLockup()}
          <h2>${copy[0]}</h2><p>${copy[1]}</p>
          <div id="auth-message">${message ? `<div class="success-banner">${escapeHtml(message)}</div>` : ''}</div>
          ${mode === 'login' ? loginForm()
            : mode === 'forgot' ? forgotForm()
            : mode === 'reset' ? resetForm(resetToken)
            : mode === 'avatar' ? avatarForm()
            : changePasswordForm(true)}
        </div>
      </section>
    </main>`;
  bindAuth(mode);
}

function loginForm() {
  return `<form id="login-form">
    <div class="form-field"><label>Email address</label><input name="email" type="email" autocomplete="email" required></div>
    <div class="form-field"><div class="input-row"><label>Password</label><button class="text-link" type="button" id="forgot-link">Forgot password?</button></div><input name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn primary auth-submit" type="submit">Sign in</button>
    <p class="auth-note">Your account is created by Gaeilgeoir Guides. Contact support if you have not received your login details.</p>
  </form>`;
}

function forgotForm() {
  return `<form id="forgot-form">
    <div class="form-field"><label>Email address</label><input name="email" type="email" autocomplete="email" required></div>
    <button class="btn primary auth-submit" type="submit">Send reset link</button>
    <button class="text-link" style="margin-top:16px" type="button" id="back-login">Back to sign in</button>
  </form>`;
}

function resetForm(token) {
  return `<form id="reset-form" data-token="${escapeHtml(token || '')}">
    <div class="form-field"><label>New password</label><input id="new-password" name="password" type="password" autocomplete="new-password" required></div>
    ${passwordRules()}
    <button class="btn primary auth-submit" type="submit">Set new password</button>
  </form>`;
}

function changePasswordForm(firstLogin = false) {
  return `<form id="change-password-form">
    <div class="form-field"><label>${firstLogin ? 'Temporary password' : 'Current password'}</label><input name="currentPassword" type="password" autocomplete="current-password" required></div>
    <div class="form-field"><label>New password</label><input id="new-password" name="newPassword" type="password" autocomplete="new-password" required></div>
    ${passwordRules()}
    <button class="btn primary auth-submit" type="submit">Save new password</button>
    ${firstLogin ? '<p class="auth-note">You will remain signed in on this device after changing your password.</p>' : ''}
  </form>`;
}

/* Asked for once, on the way in, after the password is set. Not skippable and
   not buried in settings: a feed of faces only works if everybody has one, and
   the only moment everybody reliably passes through is this one.

   The picture is previewed before it is sent, because nobody should discover
   what they uploaded by seeing it on the feed. */
function avatarForm() {
  return `<form id="avatar-form">
    <div class="avatar-pick">
      <div class="avatar-preview" id="avatar-preview">${svg.camera2}</div>
      <div>
        <button type="button" class="btn" id="choose-avatar">Choose a photograph</button>
        <p class="muted small">A clear photo of your face. JPEG, PNG or WebP, up to 6MB. Your class sees it beside anything you post.</p>
      </div>
    </div>
    <input type="file" id="avatar-input" accept="image/jpeg,image/png,image/webp" class="hidden">
    <button class="btn primary auth-submit" type="submit" id="avatar-save" disabled>Save and continue</button>
  </form>`;
}

function passwordRules() {
  return `<div class="password-rules" id="password-rules"><span data-rule="length">12+ characters</span><span data-rule="lower">Lowercase</span><span data-rule="upper">Uppercase</span><span data-rule="number">Number</span><span data-rule="symbol">Symbol</span></div>`;
}

function updatePasswordRules(value) {
  const rules = {
    length: value.length >= 12,
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    number: /[0-9]/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  };
  document.querySelectorAll('#password-rules [data-rule]').forEach((element) => element.classList.toggle('ok', rules[element.dataset.rule]));
}

function authError(error) {
  document.getElementById('auth-message').innerHTML = `<div class="error-banner">${escapeHtml(error.message)}</div>`;
}

function bindAuth(mode) {
  document.getElementById('forgot-link')?.addEventListener('click', () => renderAuth('forgot'));
  document.getElementById('back-login')?.addEventListener('click', () => renderAuth('login'));
  document.getElementById('new-password')?.addEventListener('input', (event) => updatePasswordRules(event.target.value));
  document.getElementById('login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email: form.get('email'), password: form.get('password') } });
      state.user = data.user;
      try { history.replaceState({}, '', '/'); } catch {}
      if (state.user.mustChangePassword) return renderAuth('change');
      if (state.user.mustSetAvatar && !state.user.hasAvatar) return renderAuth('avatar');
      await loadApplication();
    } catch (error) { authError(error); }
  });
  document.getElementById('forgot-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await api('/api/auth/forgot-password', { method: 'POST', body: { email: form.get('email') } });
      renderAuth('login', data.message);
    } catch (error) { authError(error); }
  });
  document.getElementById('reset-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token: event.currentTarget.dataset.token, newPassword: form.get('password') } });
      try { history.replaceState({}, '', '/'); } catch {}
      renderAuth('login', 'Your password was reset. You can now sign in.');
    } catch (error) { authError(error); }
  });
  document.getElementById('change-password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') } });
      state.user.mustChangePassword = false;
      showToast('Password changed');
      // Straight on to the photograph rather than into the portal, so the ask
      // lands while somebody is still in setting-up mode.
      if (state.user.mustSetAvatar && !state.user.hasAvatar) return renderAuth('avatar');
      await loadApplication();
    } catch (error) { authError(error); }
  });

  if (mode === 'avatar') bindAvatarForm();
}

/* Changing a photograph after the first one. The same endpoint, the same
   preview-before-send, and the picture on screen is refreshed rather than left
   showing the cached old one. */
function bindAccountPhoto() {
  const input = document.getElementById('acct-photo-input');
  const preview = document.getElementById('acct-avatar');
  if (!input) return;
  document.getElementById('acct-change-photo').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) return showToast('That photograph is over 6MB. Try a smaller one.', 'error');
    const reader = new FileReader();
    reader.onload = () => { preview.innerHTML = `<img src="${reader.result}" alt="">`; };
    reader.readAsDataURL(file);
    const form = new FormData();
    form.append('avatar', file);
    try {
      await api('/api/auth/avatar', { method: 'POST', body: form });
      state.user.hasAvatar = true;
      state.user.mustSetAvatar = false;
      showToast('Photograph updated');
    } catch (error) { showToast(error.message, 'error'); }
    input.value = '';
  });
}

function bindAvatarForm() {
  const input = document.getElementById('avatar-input');
  const preview = document.getElementById('avatar-preview');
  const save = document.getElementById('avatar-save');
  let chosen = null;

  document.getElementById('choose-avatar').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) return showToast('That photograph is over 6MB. Try a smaller one.', 'error');
    chosen = file;
    // Shown before it is sent: nobody should find out what they uploaded by
    // seeing it appear on the feed.
    const reader = new FileReader();
    reader.onload = () => { preview.innerHTML = `<img src="${reader.result}" alt="">`; };
    reader.readAsDataURL(file);
    save.disabled = false;
  });

  document.getElementById('avatar-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!chosen) return;
    const form = new FormData();
    form.append('avatar', chosen);
    save.disabled = true;
    try {
      await api('/api/auth/avatar', { method: 'POST', body: form });
      state.user.mustSetAvatar = false;
      state.user.hasAvatar = true;
      await loadApplication();
      showToast('Go raibh maith agat');
    } catch (error) { save.disabled = false; authError(error); }
  });
}

/* Shell */
/* The sidebar is hidden on a phone, so without this there is no way to move
   between screens at all. A bar across the bottom is where a thumb already is,
   and it is what every app a student uses does. */
function mobileNav() {
  const buttons = state.user.role === 'admin'
    ? [
        ['tracker', svg.grid, 'Tracker'],
        ['assignments', svg.book, 'Homework'],
        ['courses', svg.cap, 'Courses'],
        ['community', svg.board, 'Board'],
      ]
    : [
        ['calendar', svg.calendar, 'Calendar'],
        ['tracker', svg.grid, 'Tracker'],
        ['courses', svg.cap, 'Courses'],
        ['community', svg.board, 'Board'],
      ];
  const badge = (view) => {
    if (view === 'community') return state.studentData?.communityUnread || 0;
    if (view === 'tracker' && state.user.role !== 'admin') return state.studentData?.notifications || 0;
    return 0;
  };
  const attribute = state.user.role === 'admin' ? 'data-admin-view' : 'data-student-view';
  return `<nav class="mobile-nav">${buttons.map(([view, icon, label]) => {
    const count = badge(view);
    return `<button class="mnav ${state.view === view ? 'on' : ''}" ${attribute}="${view}">
      <span class="mnav-icon">${icon}${count ? `<i>${count}</i>` : ''}</span>
      <span>${label}</span>
    </button>`;
  }).join('')}</nav>`;
}

function shell({ nav, content, title, roleLabel, notificationCount = 0 }) {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">${brandLockup()}</div>
        ${nav}
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="breadcrumb"><span>Gaeilgeoir Guides</span><span>/</span><strong>${escapeHtml(title)}</strong></div>
          <div class="top-actions">
            ${notificationCount ? `<span class="nav-badge" title="${notificationCount} new piece${notificationCount === 1 ? '' : 's'} of feedback">${notificationCount}</span>` : ''}
            <button class="user-chip" id="account-menu-top">${boardAvatar(me(), 'sm')}<span class="user-chip-copy"><strong>${escapeHtml(state.user.name)}</strong><span>${escapeHtml(roleLabel)}</span></span></button>
          </div>
        </header>
        <div class="content">${content}</div>
      </main>
      ${mobileNav()}
    </div>`;
  document.getElementById('account-menu-top')?.addEventListener('click', openAccountModal);
  bindShellNavigation();
}

/* Settings open from the name in the top right rather than the sidebar, which
   keeps the sidebar to the two things a student is actually here to do.
   Leaving the course sits two disclosures deep: present for anyone who needs it,
   invisible to everyone who does not. */
/* Feedback is only worth writing if it gets read. Nothing about this is visible
   to students: they are told when new feedback arrives, never that opening it
   is recorded. */
async function openFeedbackReadReport() {
  const classId = state.activeClassId || state.classes?.[0]?.id;
  if (!classId) return showToast('Open a class first.', 'error');
  let report;
  try { report = await api(`/api/admin/reports/feedback-read/${classId}`); }
  catch (error) { return showToast(error.message, 'error'); }

  const { totals, students, unopened } = report;
  const tone = totals.rate !== null && totals.rate >= 70 ? 'good' : 'warn';
  const wait = totals.medianHoursToOpen === null
    ? ''
    : totals.medianHoursToOpen < 1
      ? `Typically opened within the hour.`
      : totals.medianHoursToOpen < 48
        ? `Typically opened after about ${totals.medianHoursToOpen} hours.`
        : `Typically opened after about ${Math.round(totals.medianHoursToOpen / 24)} days.`;

  modal({
    title: 'Feedback opened',
    subtitle: `${report.class.label} · run ${fmtDate(report.generatedAt, { time: true })}`,
    wide: true,
    body: `
      ${totals.returned === 0
        ? '<div class="empty-state"><h3>Nothing returned yet</h3><p>This report fills in once you have returned feedback to somebody.</p></div>'
        : `<div class="report-headline">
             <div><div class="engagement-value">${totals.rate}%</div><div class="engagement-label">Opened</div></div>
             <div class="report-headline-detail">
               <div class="meter"><span class="${tone}" style="width:${totals.rate}%"></span></div>
               <p class="muted small">${totals.opened} of ${totals.returned} returned pieces have been opened. ${escapeHtml(wait)}</p>
             </div>
           </div>
           <div class="section-title">By student</div>
           <table class="report-table">
             <thead><tr><th>Student</th><th>Opened</th><th>Rate</th><th>Last opened</th></tr></thead>
             <tbody>${students.map((row) => `<tr class="${row.withdrawn ? 'is-withdrawn' : ''}">
               <td><button class="text-link" data-open-student="${row.id}">${escapeHtml(row.name)}</button>${row.withdrawn ? ' <span class="pill red">Withdrawn</span>' : ''}</td>
               <td>${row.opened} of ${row.returned}</td>
               <td>${row.rate === null ? '—' : `<span class="pill ${row.rate >= 70 ? 'green' : row.rate === 0 ? 'red' : 'orange'}">${row.rate}%</span>`}</td>
               <td class="muted small">${row.lastOpened ? escapeHtml(fmtDate(row.lastOpened, { dateStyle: 'medium' })) : 'Never'}</td>
             </tr>`).join('')}</tbody>
           </table>
           ${unopened.length ? `<div class="section-title">Never opened (${unopened.length})</div>
             <table class="report-table">
               <thead><tr><th>Student</th><th>Piece</th><th>Returned</th></tr></thead>
               <tbody>${unopened.map((row) => `<tr>
                 <td><button class="text-link" data-open-student="${row.studentId}">${escapeHtml(row.name)}</button></td>
                 <td>${escapeHtml(row.title)}<span class="muted small"> · ${row.kind === 'checkin' ? 'check-in' : 'homework'}</span></td>
                 <td class="muted small">${escapeHtml(fmtDate(row.returnedAt, { dateStyle: 'medium' }))}</td>
               </tr>`).join('')}</tbody>
             </table>` : '<div class="all-in stack-top">Everything you have returned has been opened.</div>'}`}`,
    footer: `<button class="btn" id="copy-read-report">Copy as text</button><button class="btn primary" data-close-modal>Done</button>`,
    onOpen() {
      modalRoot.querySelectorAll('[data-open-student]').forEach((button) =>
        button.addEventListener('click', () => openStudentProfile(button.dataset.openStudent)));
      document.getElementById('copy-read-report').addEventListener('click', async () => {
        const lines = [
          `Feedback opened — ${report.class.label}`,
          `${totals.opened} of ${totals.returned} opened (${totals.rate ?? 0}%)`,
          '',
          ...students.map((row) => `${row.name}: ${row.opened} of ${row.returned}${row.rate === null ? '' : ` (${row.rate}%)`}`),
          ...(unopened.length ? ['', 'Never opened:', ...unopened.map((row) => `${row.name} — ${row.title}`)] : []),
        ].join('\n');
        try { await navigator.clipboard.writeText(lines); showToast('Report copied'); }
        catch { showToast('Could not copy', 'error'); }
      });
    },
  });
}

function openAccountModal() {
  const student = state.user.role === 'student';
  const withdrawn = state.studentData?.withdrawnAt;
  modal({
    title: 'Settings',
    subtitle: `${state.user.name} · ${state.user.email}`,
    body: `<div class="acct-photo">
        <div class="avatar-preview" id="acct-avatar">${state.user.hasAvatar
          ? `<img src="/api/media/avatar/${state.user.id}?t=${Date.now()}" alt="">`
          : svg.camera2}</div>
        <div>
          <button type="button" class="btn" id="acct-change-photo">${state.user.hasAvatar ? 'Change photograph' : 'Add a photograph'}</button>
          <p class="muted small">Your class sees this beside anything you post.</p>
        </div>
        <input type="file" id="acct-photo-input" accept="image/jpeg,image/png,image/webp" class="hidden">
      </div>
      ${changePasswordForm(false)}
      ${student ? (withdrawn
        ? `<div class="notice stack-top"><strong>You have withdrawn from this course.</strong><span>Recorded ${escapeHtml(fmtDate(withdrawn, { dateStyle: 'medium' }))}. No further work is expected and reminders have stopped. Everything you submitted is still here.</span></div>`
        : `<details class="options-block stack-top">
            <summary>Options</summary>
            <div class="options-body">
              <details class="options-block nested">
                <summary>Stepping Back</summary>
                <div class="options-body">
                  <p>If you must step back from the course for whatever reason please fill in the below form.</p>
                  <button class="btn" id="open-withdrawal">Course withdrawal form</button>
                </div>
              </details>
            </div>
          </details>`) : ''}
      ${student ? '' : `<details class="options-block stack-top">
        <summary>Reports</summary>
        <div class="options-body">
          <p>Run a report on the class you are currently looking at.</p>
          <button class="btn" id="open-read-report">Feedback opened</button>
        </div>
      </details>`}`,
    footer: `<button class="btn danger" id="logout-button">Log out</button><button class="btn" data-close-modal>Close</button>`,
    onOpen() {
      bindAccountPhoto();
      document.getElementById('new-password')?.addEventListener('input', (event) => updatePasswordRules(event.target.value));
      document.getElementById('change-password-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') } });
          closeModal(); showToast('Password changed');
        } catch (error) { showToast(error.message, 'error'); }
      });
      document.getElementById('open-withdrawal')?.addEventListener('click', openWithdrawalForm);
      document.getElementById('open-read-report')?.addEventListener('click', openFeedbackReadReport);
      document.getElementById('logout-button').addEventListener('click', logout);
    },
  });
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  state.user = null; closeModal(); renderAuth('login');
}

/* Admin */
function adminNav() {
  const classButtons = state.classes.map((klass) => `
    <button class="nav-button ${state.view === 'tracker' && state.activeClassId === klass.id ? 'active' : ''}" data-admin-view="tracker" data-class-id="${klass.id}">
      <span class="nav-icon">${svg.grid}</span><span><strong style="display:block;font-size:11px">${escapeHtml(klass.programme_name)}</strong><small>${escapeHtml(DAY_NAMES[klass.day_of_week])} · ${escapeHtml(String(klass.start_time).slice(0, 5))}</small></span>
    </button>`).join('');
  return `
    <div class="nav-label">Class trackers</div><nav class="nav">${classButtons}</nav>
    <div class="nav-label">Manage</div><nav class="nav">
      ${adminNavButton('people', svg.users, 'Classes & students')}
      ${adminNavButton('assignments', svg.book, 'Homework')}
      ${adminNavButton('courses', svg.cap, 'Courses')}
      ${adminNavButton('checkins', svg.talk, 'Weekly check-ins')}
      ${adminNavButton('community', svg.board, 'Community')}
      ${adminNavButton('attendance', svg.upload, 'Attendance upload')}
      ${adminNavButton('reminders', svg.mail, 'Email reminders')}
      ${adminNavButton('ai', svg.spark, 'Feedback drafting')}
      ${state.user.isSuperAdmin ? adminNavButton('admins', svg.lock, 'Administrators') : ''}
    </nav>`;
}

function adminNavButton(view, icon, label) {
  return `<button class="nav-button ${state.view === view ? 'active' : ''}" data-admin-view="${view}"><span class="nav-icon">${icon}</span>${label}</button>`;
}

function bindShellNavigation() {
  document.querySelectorAll('[data-admin-view]').forEach((button) => button.addEventListener('click', async () => {
    /* Pressing Courses in the sidebar means "show me the courses", not "stay
       where I am" — so the one being viewed is let go of first. */
    if (button.dataset.adminView === 'courses') { state.course = null; state.lessonId = null; }
    state.view = button.dataset.adminView;
    if (button.dataset.classId) state.activeClassId = button.dataset.classId;
    await renderAdmin();
  }));
  document.querySelectorAll('[data-student-view]').forEach((button) => button.addEventListener('click', () => showStudentView(button.dataset.studentView)));
}

/* Two of the student screens need their own fetch. Opening the board is also what
   clears its badge: marking each thread read separately would leave a count that
   never quite reaches zero. */
async function showStudentView(view) {
  // Same reasoning as the sidebar: the nav item goes to the shelf.
  if (view === 'courses') { state.course = null; state.lessonId = null; }
  state.view = view;
  try {
    if (view === 'courses' && !state.course) await loadCourses();
    if (view === 'community') {
      const params = new URLSearchParams();
      if (state.boardSort === 'top') params.set('sort', 'top');
      if (state.boardCategoryId) params.set('categoryId', state.boardCategoryId);
      state.community = await api(`/api/student/community${params.toString() ? `?${params}` : ''}`);
      if (state.studentData.communityUnread) {
        await api('/api/student/community/read', { method: 'POST' });
        state.studentData.communityUnread = 0;
      }
    }
  } catch (error) { showToast(error.message, 'error'); }
  renderStudent();
}

async function loadAdmin() {
  const bootstrap = await api('/api/admin/bootstrap');
  state.classes = bootstrap.classes;
  state.activeClassId ||= state.classes[0]?.id || null;
  state.view ||= state.activeClassId ? 'tracker' : 'people';
  await renderAdmin();
}

async function renderAdmin() {
  let content = '';
  let title = 'Administration';
  try {
    if (state.view === 'tracker') {
      if (!state.activeClassId) { state.view = 'people'; return renderAdmin(); }
      [state.tracker, state.engagement] = await Promise.all([
        api(`/api/admin/tracker/${state.activeClassId}`),
        api(`/api/admin/engagement/${state.activeClassId}`).catch(() => null),
      ]);
      title = 'Weekly tracker'; content = adminTrackerView();
    } else if (state.view === 'people') {
      [state.classes, state.students, state.settings] = await Promise.all([api('/api/admin/classes'), api('/api/admin/students'), api('/api/settings')]);
      title = 'Classes & students'; content = peopleView();
    } else if (state.view === 'assignments') {
      const query = state.showArchived ? '?includeArchived=true' : '';
      [state.assignments, state.teachingWeeks, state.classes] = await Promise.all([
        api(`/api/admin/assignments${query}`),
        api('/api/admin/teaching-weeks'),
        api('/api/admin/classes'),
      ]);
      title = 'Homework'; content = assignmentsView();
    } else if (state.view === 'checkins') {
      state.classes = await api('/api/admin/classes');
      state.checkinClassId ||= state.classes[0]?.id || null;
      state.teachingWeeks = state.checkinClassId ? await api(`/api/admin/teaching-weeks?classId=${state.checkinClassId}`) : [];
      title = 'Weekly check-ins'; content = checkinsView();
    } else if (state.view === 'courses') {
      state.classes = await api('/api/admin/classes');
      if (state.course) { title = 'Courses'; content = coursePage(); }
      else { await loadCourses(); title = 'Courses'; content = coursesView(); }
    } else if (state.view === 'community') {
      state.classes = await api('/api/admin/classes');
      state.communityClassId ||= state.activeClassId || state.classes[0]?.id || null;
      state.community = state.communityClassId ? await api(`/api/admin/community/${state.communityClassId}`) : null;
      title = 'Community'; content = communityView();
    } else if (state.view === 'admins') {
      /* Guarded on the server as well: the navigation item being hidden is a
         courtesy, not the control. */
      state.admins = await api('/api/admin/admins');
      title = 'Administrators'; content = adminsView();
    } else if (state.view === 'attendance') {
      state.classes = await api('/api/admin/classes');
      title = 'Attendance upload'; content = attendanceView();
    } else if (state.view === 'reminders' || state.view === 'ai') {
      state.settings = await api('/api/settings');
      title = state.view === 'reminders' ? 'Email reminders' : 'Feedback drafting';
      content = state.view === 'reminders' ? remindersView() : aiSettingsView();
    }
    shell({ nav: adminNav(), content, title, roleLabel: 'Administrator' });
    bindAdminView();
    if (state.view === 'courses') bindCourse();
  } catch (error) {
    showToast(error.message, 'error');
    if (error.status === 401) renderAuth('login');
  }
}

function pageHeader(kicker, title, subtitle, actions = '') {
  return `<div class="page-header"><div><div class="page-kicker">${escapeHtml(kicker)}</div><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-subtitle">${escapeHtml(subtitle)}</p></div><div class="actions">${actions}</div></div>`;
}

function trackerMaps() {
  const attendance = new Map(state.tracker.attendance.map((row) => [`${row.student_id}:${row.week_id}`, row]));
  const checkins = new Map(state.tracker.checkins.map((row) => [`${row.student_id}:${row.week_id}`, row]));
  const homework = new Map(state.tracker.homework.map((row) => [`${row.student_id}:${row.assignment_id}`, row]));
  // A week can carry more than one assignment. Keeping a list rather than a single
  // value stops the second one disappearing from the tracker entirely.
  const assignmentsByWeek = new Map();
  state.tracker.assignments.forEach((assignment) => {
    if (!assignment.week_id) return;
    assignmentsByWeek.set(assignment.week_id, [...(assignmentsByWeek.get(assignment.week_id) || []), assignment]);
  });
  return { attendance, checkins, homework, assignmentsByWeek };
}

const ADMIN_ICON = { checkin: 'talk', homework: 'book' };

function adminTrackerState(type, record, deadline, assignment = null, week = null) {
  // Work handed in after a soft deadline is marked so it can be seen at a glance.
  if (type === 'homework' && record?.submitted_late && record.status !== 'draft') {
    return record.status === 'returned'
      ? { tone: 'green', icon: 'book', label: 'Returned', hint: 'Handed in late' }
      : { tone: 'orange', icon: 'book', label: 'To review, late', hint: 'Handed in after the deadline' };
  }
  if (type === 'attendance') return attendanceState(record);
  const icon = ADMIN_ICON[type];
  const noun = type === 'homework' ? 'Homework' : 'Check-in';
  if (record?.status === 'returned') return { tone: 'green', icon, label: 'Returned', hint: `${noun} feedback has been returned to the student` };
  if (record?.status === 'submitted') {
    return record.feedback_state === 'ai_drafted'
      ? { tone: 'orange', icon, label: 'Draft ready', hint: `${noun} submitted. An AI draft is ready for you to edit and return.`, attention: true }
      : { tone: 'orange', icon, label: 'To review', hint: `${noun} submitted and waiting for your reply`, attention: true };
  }
  if (assignment && !assignmentClosed(assignment)) {
    return Date.now() > effectiveDeadline(assignment)
      ? { tone: 'grey', icon, label: 'Open, late', hint: 'Past the deadline but still accepting submissions' }
      : { tone: 'grey', icon, label: 'Open', hint: `${noun} open and not submitted yet` };
  }
  if (week && week.checkin_enabled === false) return { tone: 'grey', icon, label: 'Off', hint: 'No check-in was set for this week' };
  if (week && week.checkin_hard_deadline === false && Date.now() > new Date(deadline).getTime()) {
    return { tone: 'grey', icon, label: 'Open, late', hint: 'Past the deadline but still accepting check-ins' };
  }
  if (Date.now() > new Date(deadline).getTime()) return { tone: 'red', icon: 'x', label: 'Missed', hint: `The deadline passed with no ${noun.toLowerCase()}` };
  return { tone: 'grey', icon, label: 'Open', hint: `${noun} open and not submitted yet` };
}

function adminTrackerView() {
  const t = state.tracker;
  const maps = trackerMaps();
  const submittedCheckins = t.checkins.filter((row) => row.status === 'submitted').length;
  const submittedHomework = t.homework.filter((row) => row.status === 'submitted').length;
  const liveCount = t.attendance.filter((row) => row.status === 'live').length;
  const thisMonday = toZonedInput(new Date()).slice(0, 10);
  const weeks = t.weeks.filter((week) => String(week.week_start).slice(0, 10) <= thisMonday || new Date(week.checkin_release_at) <= new Date());
  const currentWeekId = weeks.at(-1)?.id;
  const toReview = submittedCheckins + submittedHomework;
  return `
    ${pageHeader('Class workspace', t.class.label, `A separate weekly tracker for this class. Times shown in ${escapeHtml(classTimezone())}.`, `<button class="btn" id="open-attendance">Upload attendance</button><button class="btn primary" id="new-assignment">Assign homework</button>`)}
    <div class="stats">
      <div class="stat"><div class="stat-label">Students</div><div class="stat-value">${t.students.length}</div><div class="stat-note">Active in this class</div></div>
      <div class="stat ${submittedCheckins ? 'warning' : ''}"><div class="stat-label">Check-ins to review</div><div class="stat-value">${submittedCheckins}</div><div class="stat-note">Ready for teacher review</div></div>
      <div class="stat ${submittedHomework ? 'warning' : ''}"><div class="stat-label">Homework to review</div><div class="stat-value">${submittedHomework}</div><div class="stat-note">Awaiting teacher feedback</div></div>
      <div class="stat accent"><div class="stat-label">Live attendance records</div><div class="stat-value">${liveCount}</div><div class="stat-note">Across visible weeks</div></div>
    </div>
    ${engagementPanel()}
    <div class="card toolbar">
      <div class="toolbar-group"><div class="search-box"><span>⌕</span><input id="tracker-search" placeholder="Search students" value="${escapeHtml(state.trackerSearch || '')}"></div>
        <button class="filter-chip ${state.filter === 'all' ? 'active' : ''}" data-filter="all">All</button><button class="filter-chip ${state.filter === 'attention' ? 'active' : ''}" data-filter="attention">Needs review${toReview ? ` (${toReview})` : ''}</button><button class="filter-chip ${state.filter === 'missing' ? 'active' : ''}" data-filter="missing">Missing</button>
      </div><div class="toolbar-group"><span class="empty-note hidden" id="tracker-empty-note"></span><button class="btn small" id="jump-latest">Jump to latest week →</button></div>
    </div>
    <section class="card tracker-card">
      <div class="tracker-scroll" id="tracker-scroll"><table class="tracker-table">
        <thead><tr><th class="student-head">Student</th>${weeks.map((week) => weekHeadCell(week, maps, currentWeekId)).join('')}</tr></thead>
        <tbody id="tracker-body">${t.students.map((student) => adminStudentRow(student, weeks, maps, currentWeekId)).join('')}</tbody>
      </table></div>
      ${trackerLegend()}
    </section>`;
}

/* Column headings. The three per-week actions are labelled with their own icon
   rather than a repeated block of uppercase words: the same camera, speech and
   book glyphs appear in the cells below and are explained in the legend, so the
   header stays readable across a dozen columns instead of becoming noise. */
function weekHeadCell(week, maps, currentWeekId) {
  const assignments = maps.assignmentsByWeek.get(week.id) || [];
  const columns = [
    { icon: 'camera', label: 'Attendance' },
    { icon: 'talk', label: 'Check-in' },
    ...assignments.map((assignment) => ({ icon: 'book', label: assignment.title })),
  ];
  const isCurrent = week.id === currentWeekId;
  return `<th class="week-head ${isCurrent ? 'is-current' : ''}" scope="col">
    <div class="week-head-inner">
      <div class="week-name" title="Week beginning ${escapeHtml(fmtDate(`${String(week.week_start).slice(0, 10)}T12:00:00Z`, { timeZone: 'UTC' }))}">${fmtWeek(week.week_start)}${isCurrent ? '<span class="week-now">Now</span>' : ''}</div>
      <div class="week-due">Check-in due ${escapeHtml(fmtDate(week.checkin_due_at, { time: true, weekday: true, dateStyle: 'short' }))}</div>
    </div>
    <div class="week-cols" style="--cols:${columns.length}">
      ${columns.map((column) => `<span class="week-col" title="${escapeHtml(column.label)}" aria-label="${escapeHtml(column.label)}">${svg[column.icon]}</span>`).join('')}
    </div>
  </th>`;
}

function legendKey(tone, icon, label) {
  return `<span class="legend-item"><span class="legend-icon ${tone}">${svg[icon]}</span>${escapeHtml(label)}</span>`;
}

function trackerLegend(role = 'admin') {
  const states = role === 'admin'
    ? [['grey', 'book', 'Open'], ['orange', 'book', 'Needs your review'], ['green', 'book', 'Returned'], ['red', 'x', 'Missed or absent']]
    : [['grey', 'book', 'To do'], ['green', 'book', 'Submitted or returned'], ['none', 'book', 'No homework set'], ['red', 'x', 'Missed or absent']];
  return `<div class="legend">
    <div class="legend-group"><span class="legend-title">Columns</span>
      ${legendKey('plain', 'camera', 'Attendance')}${legendKey('plain', 'talk', 'Check-in')}${legendKey('plain', 'book', 'Homework')}
    </div>
    <div class="legend-group"><span class="legend-title">Status</span>
      ${states.map(([tone, icon, label]) => legendKey(tone, icon, label)).join('')}
    </div>
  </div>`;
}

/* How the class is actually going: how many are still on it, and how much of the
   work that was genuinely due has come in. Both figures ignore weeks that were
   switched off and people who have left, because counting either would flatter
   the number into meaning nothing. */
function engagementPanel() {
  const data = state.engagement;
  if (!data) return '';
  const { people, expected, retention, completion, withdrawals } = data;
  const bar = (value, tone) => `<div class="meter"><span class="${tone}" style="width:${Math.max(0, Math.min(100, value || 0))}%"></span></div>`;

  return `<section class="card engagement">
    <div class="card-header"><div><h2>How the class is going</h2><p>Weeks you switched off and students who have withdrawn are left out of both figures.</p></div></div>
    <div class="card-body engagement-grid">
      <div class="engagement-stat">
        <div class="engagement-value">${retention === null ? '—' : `${retention}%`}</div>
        <div class="engagement-label">Still on the course</div>
        ${bar(retention, retention !== null && retention >= 80 ? 'good' : 'warn')}
        <div class="engagement-note">${people.active} of ${people.total} student${people.total === 1 ? '' : 's'}${people.withdrawn ? ` · ${people.withdrawn} withdrawn` : ''}</div>
      </div>
      <div class="engagement-stat">
        <div class="engagement-value">${completion === null ? '—' : `${completion}%`}</div>
        <div class="engagement-label">Work submitted</div>
        ${bar(completion, completion !== null && completion >= 70 ? 'good' : 'warn')}
        <div class="engagement-note">${expected.submitted} of ${expected.expected} due so far · ${expected.checkins_due} check-in${expected.checkins_due === 1 ? '' : 's'} and ${expected.assignments_due} assignment${expected.assignments_due === 1 ? '' : 's'} released</div>
      </div>
      ${itemBreakdown(data)}
      ${withdrawals.length ? `<div class="engagement-stat wide">
        <div class="engagement-label">Withdrawals</div>
        <ul class="withdrawal-list">${withdrawals.slice(0, 5).map((row) => `<li>
          <button class="text-link" data-open-student="${row.student_id}">${escapeHtml(row.name)}</button>
          <span>${escapeHtml(row.reason)}</span>
          <small>${escapeHtml(fmtDate(row.submitted_at, { dateStyle: 'medium' }))}</small>
        </li>`).join('')}</ul>
        ${withdrawals.length > 5 ? `<div class="engagement-note">and ${withdrawals.length - 5} more</div>` : ''}
      </div>` : ''}
    </div>
  </section>`;
}

/* The headline figure averages the whole term, so a week where half the class
   vanished disappears into it. This answers the narrower question instead: of
   this one check-in, or this one assignment, who actually did it. */
function itemBreakdown(data) {
  const items = data.items || [];
  if (!items.length) return '';
  const key = (item) => `${item.kind}:${item.id}`;
  const chosen = items.find((item) => key(item) === state.engagementItem) || items[0];
  const tone = chosen.rate !== null && chosen.rate >= 70 ? 'good' : 'warn';
  const outstanding = chosen.missing || [];

  return `<div class="engagement-stat wide breakdown">
    <div class="breakdown-head">
      <div class="engagement-label">One check-in or assignment at a time</div>
      <select id="engagement-item" aria-label="Choose a check-in or assignment">
        ${items.map((item) => `<option value="${key(item)}"${key(item) === key(chosen) ? ' selected' : ''}>${escapeHtml(itemName(item))}</option>`).join('')}
      </select>
    </div>
    <div class="breakdown-body">
      <div class="breakdown-figure">
        <div class="engagement-value">${chosen.rate === null ? '—' : `${chosen.rate}%`}</div>
        <div class="engagement-note">${chosen.submitted} of ${chosen.expected} submitted${chosen.dueAt ? ` · due ${escapeHtml(fmtDate(chosen.dueAt, { time: true }))}` : ''}</div>
        <div class="meter"><span class="${tone}" style="width:${Math.max(0, Math.min(100, chosen.rate || 0))}%"></span></div>
      </div>
      <div class="breakdown-missing">
        ${outstanding.length
          ? `<div class="engagement-label">Still to submit (${outstanding.length})</div>
             <div class="missing-names">${outstanding.map((person) => `<button class="text-link" data-open-student="${person.id}">${escapeHtml(person.name)}</button>`).join('')}</div>`
          : '<div class="all-in">Everyone has submitted this one.</div>'}
      </div>
    </div>
  </div>`;
}

function itemName(item) {
  if (item.kind === 'homework') return `Homework · ${item.label}`;
  const week = fmtWeek(item.weekStart);
  return `Check-in · week of ${week}${item.label ? ` (${item.label})` : ''}`;
}

function adminStudentRow(student, weeks, maps, currentWeekId) {
  const hasAttention = weeks.some((week) => {
    const assignments = maps.assignmentsByWeek.get(week.id) || [];
    return maps.checkins.get(`${student.id}:${week.id}`)?.status === 'submitted' ||
      assignments.some((assignment) => maps.homework.get(`${student.id}:${assignment.id}`)?.status === 'submitted');
  });
  const hasMissing = weeks.some((week) => {
    const assignments = maps.assignmentsByWeek.get(week.id) || [];
    return (Date.now() > new Date(week.checkin_due_at).getTime() && !maps.checkins.get(`${student.id}:${week.id}`)) ||
      assignments.some((assignment) => assignmentClosed(assignment) && !maps.homework.get(`${student.id}:${assignment.id}`));
  });
  return `<tr class="${student.withdrawn_at ? 'is-withdrawn' : ''}" data-name="${escapeHtml(`${student.name} ${student.email}`.toLowerCase())}" data-attention="${hasAttention && !student.withdrawn_at}" data-missing="${hasMissing && !student.withdrawn_at}">
    <th class="student-column ${student.withdrawn_at ? 'has-withdrawn' : ''}" scope="row"><button class="student-cell" data-open-student="${student.id}" title="Open ${escapeHtml(student.name)}'s profile and notes"><div class="student-avatar">${initials(student.name)}</div><div><div class="student-name">${escapeHtml(student.name)}${student.withdrawn_at ? '<span class="pill red">Withdrawn</span>' : ''}</div><div class="student-email">${student.withdrawn_at ? escapeHtml(`Left ${fmtDate(student.withdrawn_at, { dateStyle: 'medium' })}`) : escapeHtml(student.email)}</div></div><span class="student-cell-go">${svg.note}</span></button></th>
    ${weeks.map((week) => {
      const assignments = maps.assignmentsByWeek.get(week.id) || [];
      const cells = [
        { state: adminTrackerState('attendance', maps.attendance.get(`${student.id}:${week.id}`)), type: 'attendance', extra: '' },
        { state: adminTrackerState('checkin', maps.checkins.get(`${student.id}:${week.id}`), week.checkin_due_at, null, week), type: 'checkin', extra: '' },
        ...assignments.map((assignment) => ({
          state: adminTrackerState('homework', maps.homework.get(`${student.id}:${assignment.id}`), assignment.reopened_until || assignment.deadline_at, assignment),
          type: 'homework',
          extra: ` data-assignment-id="${assignment.id}"`,
        })),
      ];
      return `<td class="week-data ${week.id === currentWeekId ? 'is-current' : ''}"><div class="wk-cell" style="--cols:${cells.length}">
        ${cells.map((cell) => `<button class="wk-action ${cell.state.attention ? 'needs-review' : ''}" data-review-type="${cell.type}" data-student-id="${student.id}" data-week-id="${week.id}"${cell.extra} aria-label="${escapeHtml(`${student.name}, week of ${fmtWeek(week.week_start)}: ${cell.state.hint || cell.state.label}`)}">${statusIcon(cell.state)}</button>`).join('')}
      </div></td>`;
    }).join('')}</tr>`;
}

function peopleView() {
  return `
    ${pageHeader('Administration', 'Classes and students', 'Create class groups, invite students and manage access.', `<button class="btn" id="add-class">Add class</button><button class="btn" id="add-student">Add student</button><button class="btn primary" id="import-students">Upload students</button>`)}
    ${emailModeBanner()}
    <div class="tabs"><button class="tab active" data-people-tab="classes">Classes</button><button class="tab" data-people-tab="students">Students</button></div>
    <section id="classes-tab"><div class="class-grid">${state.classes.map((klass) => `
      <article class="card class-card"><div class="card-actions"><div><h3>${escapeHtml(classLabel(klass))}</h3><p>Separate tracker, attendance and homework.</p></div><button class="btn small" data-open-class="${klass.id}">Open tracker</button></div>
      <div class="mini-stats"><span class="mini-stat">${klass.student_count || 0} students</span><span class="mini-stat">${escapeHtml(klass.timezone)}</span><span class="mini-stat ${klass.join_url ? 'good' : ''}">${klass.join_url ? 'Class link set' : 'No class link'}</span><span class="mini-stat">${klass.has_community === false ? 'No board' : 'Has a board'}</span></div>
      <div class="actions stack-top"><button class="btn small" data-class-link="${klass.id}">${svg.settings || svg.video} Class setup</button><button class="btn small danger" data-delete-class="${klass.id}">Delete class</button></div></article>`).join('') || '<div class="empty-state"><h3>No classes yet</h3><p>Add your first class to begin.</p></div>'}</div></section>
    <section id="students-tab" class="hidden"><div class="card table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Email</th><th>Current class</th><th>Login</th><th></th></tr></thead><tbody>
      ${state.students.map((student) => `<tr><td><button class="text-link strong-link" data-open-student="${student.id}">${escapeHtml(student.name)}</button></td><td>${escapeHtml(student.email)}</td><td><select class="select" data-student-class="${student.id}">${state.classes.map((klass) => `<option value="${klass.id}" ${student.class_id === klass.id ? 'selected' : ''}>${escapeHtml(classLabel(klass))}</option>`).join('')}</select></td><td>${student.last_login_at ? `<span class="pill green">Last login ${fmtDate(student.last_login_at)}</span>` : '<span class="pill orange">Invite pending</span>'}</td><td><div class="row-actions"><button class="btn small" data-open-student="${student.id}">${svg.note} Notes</button><button class="btn small" data-resend="${student.id}">Resend invite</button><button class="btn small" data-reset-student="${student.id}">Reset password</button></div></td></tr>`).join('')}
    </tbody></table></div></section>`;
}

/* Homework is planned week by week, so the default view is a calendar rather than
   a list. Teaching weeks are drawn in behind the deadlines, which means a week with
   no homework reads as a deliberate gap rather than as missing data. */
/* Console mode is the silent failure: accounts get created, invitations get
   "sent", and nothing arrives. Say so on the screen where students are added. */
function emailModeBanner() {
  if (state.settings?.email?.provider && state.settings.email.provider !== 'console') return '';
  return `<div class="notice warning">
    <strong>Invitation emails are not being delivered.</strong>
    <span>Email is in test mode, so new students are created but never receive their login. Set up SMTP or the GoHighLevel webhook under Email reminders, send a test email, then add or re-invite your students.</span>
    <button class="btn small" data-admin-view="reminders">Set up email</button>
  </div>`;
}

async function confirmDeleteClass(id) {
  let impact;
  try { impact = await api(`/api/admin/classes/${id}/impact`); }
  catch (error) { return showToast(error.message, 'error'); }

  const work = impact.checkins + impact.submissions;
  modal({
    title: `Delete “${impact.class.label}”?`,
    subtitle: 'This cannot be undone.',
    body: `
      <p class="muted small">Deleting a class removes its whole history. The students themselves are kept and simply end up without a class, but everything they did here goes.</p>
      <div class="detail-grid">
        <div class="detail"><small>Students enrolled</small><strong>${impact.students}</strong></div>
        <div class="detail"><small>Teaching weeks</small><strong>${impact.weeks}</strong></div>
        <div class="detail"><small>Assignments</small><strong>${impact.assignments}</strong></div>
        <div class="detail"><small>Attendance records</small><strong>${impact.attendance}</strong></div>
        <div class="detail"><small>Check-ins submitted</small><strong>${impact.checkins}</strong></div>
        <div class="detail"><small>Homework submitted</small><strong>${impact.submissions}</strong></div>
      </div>
      ${work ? `<div class="error-banner stack-top"><strong>${work} piece${work === 1 ? '' : 's'} of student work will be deleted permanently.</strong></div>` : '<p class="muted small stack-top">No student work has been submitted in this class, so it can be deleted cleanly.</p>'}`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn danger" id="confirm-delete-class">Delete${work ? ` and remove ${work} piece${work === 1 ? '' : 's'} of work` : ''}</button>`,
    onOpen() {
      document.getElementById('confirm-delete-class').addEventListener('click', async () => {
        try {
          await api(`/api/admin/classes/${id}?confirmWork=${work}`, { method: 'DELETE' });
          closeModal();
          if (state.activeClassId === id) state.activeClassId = null;
          state.view = 'people';
          await loadAdmin();
          showToast('Class deleted');
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

function assignmentsView() {
  const classes = state.classes || [];
  const filter = state.assignmentClassId || '';
  const visible = state.assignments.filter((row) => !filter || row.class_id === filter);
  const archivedCount = visible.filter((row) => row.status === 'archived').length;

  const actions = `
    <button class="btn" id="calendar-subscribe">${svg.calendar} Add to calendar</button>
    <button class="btn" id="import-assignments">Import a spreadsheet</button>
    <button class="btn primary" id="create-assignment">Create assignment</button>`;

  return `
    ${pageHeader('Coursework', 'Homework', 'Plan the term week by week. Click a day to set homework, click an assignment to edit it.', actions)}
    <div class="card toolbar">
      <div class="toolbar-group">
        <div class="view-switch">
          <button class="view-tab ${state.assignmentView !== 'list' ? 'active' : ''}" data-assignment-view="calendar">${svg.calendar} Calendar</button>
          <button class="view-tab ${state.assignmentView === 'list' ? 'active' : ''}" data-assignment-view="list">${svg.grid} List</button>
        </div>
        <select class="select" id="assignment-class-filter">
          <option value="">All classes</option>
          ${classes.map((klass) => `<option value="${klass.id}" ${filter === klass.id ? 'selected' : ''}>${escapeHtml(classLabel(klass))}</option>`).join('')}
        </select>
      </div>
      <div class="toolbar-group">
        <label class="toggle-row"><span class="toggle"><input id="show-archived" type="checkbox" ${state.showArchived ? 'checked' : ''}><span></span></span>Show archived${archivedCount ? ` (${archivedCount})` : ''}</label>
      </div>
    </div>
    ${state.assignmentView === 'list' ? assignmentListView(visible) : assignmentCalendarView(visible)}`;
}

function assignmentCalendarView(assignments) {
  const cursor = state.assignmentMonth ? new Date(state.assignmentMonth) : new Date();
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const today = zonedDateParts(new Date());
  const filter = state.assignmentClassId || '';

  // Which calendar days belong to a teaching week, and which of those weeks
  // already carry homework. Two classes can share the same dates, so each day
  // collects every week covering it rather than keeping only the last one.
  const weeks = (state.teachingWeeks || []).filter((week) => !filter || week.class_id === filter);
  /* A week counts as having homework when a deadline actually falls inside it.
     Linking an assignment to a teaching week is optional, so going by the link
     alone would label a week empty while its deadlines sit there in plain sight. */
  const weekHasHomework = new Set();
  weeks.forEach((week) => {
    const start = new Date(`${String(week.week_start).slice(0, 10)}T00:00:00Z`).getTime();
    const end = start + 7 * 86400000;
    const covered = assignments.some((assignment) => {
      if (assignment.week_id === week.id) return true;
      if (assignment.class_id !== week.class_id) return false;
      const due = new Date(assignment.reopened_until || assignment.deadline_at).getTime();
      return due >= start && due < end;
    });
    if (covered) weekHasHomework.add(week.id);
  });
  const weekDays = new Map();
  const emptyWeekStarts = new Map();
  weeks.forEach((week) => {
    const start = new Date(`${String(week.week_start).slice(0, 10)}T12:00:00Z`);
    const hasHomework = weekHasHomework.has(week.id);
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(start.getTime() + i * 86400000);
      if (day.getUTCFullYear() !== year || day.getUTCMonth() !== month) continue;
      const entry = weekDays.get(day.getUTCDate()) || { weeks: [], hasHomework: false };
      entry.weeks.push(week);
      // A day only counts as "nothing set" when no class covering it has homework.
      entry.hasHomework = entry.hasHomework || hasHomework;
      weekDays.set(day.getUTCDate(), entry);
      // The label goes on the first day of the week that falls inside this month.
      if (!hasHomework && !emptyWeekStarts.has(week.id)) emptyWeekStarts.set(week.id, { day: day.getUTCDate(), week });
    }
  });
  // Only label a week as empty if nothing in it carries homework on any day.
  const emptyLabels = new Map();
  emptyWeekStarts.forEach(({ day, week }) => {
    if (weekDays.get(day)?.hasHomework) return;
    emptyLabels.set(day, [...(emptyLabels.get(day) || []), week]);
  });

  const events = new Map();
  assignments.forEach((assignment) => {
    const when = zonedDateParts(assignment.reopened_until || assignment.deadline_at);
    if (when.year !== year || when.month !== month) return;
    const closed = assignmentClosed(assignment);
    const tone = assignment.status === 'archived' ? 'archived' : closed ? 'closed' : 'open';
    events.set(when.day, [...(events.get(when.day) || []), `<button class="calendar-event assignment ${tone}" data-edit-assignment="${assignment.id}" title="${escapeHtml(`${assignment.title} — due ${fmtDate(assignment.reopened_until || assignment.deadline_at, { time: true, weekday: true, dateStyle: 'short' })}`)}">
      <span class="event-time">${escapeHtml(fmtDate(assignment.reopened_until || assignment.deadline_at, { time: true, timeOnly: true }))}</span>
      <span class="event-title">${escapeHtml(assignment.title)}</span>
    </button>`]);
  });

  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<div class="calendar-day is-empty"></div>');
  for (let day = 1; day <= days; day += 1) {
    const teaching = weekDays.get(day);
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = today.year === year && today.month === month && today.day === day;
    const empty = emptyLabels.get(day);
    cells.push(`<div class="calendar-day ${isToday ? 'is-today' : ''} ${teaching ? 'is-teaching' : ''}">
      <div class="calendar-day-head"><span class="calendar-number">${day}</span>
        <button class="day-add" data-add-on="${iso}" title="Set homework due ${escapeHtml(fmtDate(`${iso}T12:00:00Z`, { timeZone: 'UTC' }))}" aria-label="Set homework due on ${day}">+</button>
      </div>
      ${empty ? `<span class="no-homework-chip" title="${escapeHtml(empty.map((week) => week.classLabel).join(', '))}">No homework this week</span>` : ''}
      ${(events.get(day) || []).join('')}
    </div>`);
  }

  const withoutHomework = emptyLabels.size;

  return `<section class="card calendar assignment-calendar">
    <div class="calendar-head">
      <h2>${new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric' }).format(first)}</h2>
      <div class="calendar-nav"><button class="btn small" data-assignment-step="-1" aria-label="Previous month">←</button><button class="btn small" data-assignment-step="0">Today</button><button class="btn small" data-assignment-step="1" aria-label="Next month">→</button></div>
    </div>
    <div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => `<div class="calendar-name">${day}</div>`).join('')}${cells.join('')}</div>
    <div class="legend">
      <div class="legend-group"><span class="legend-title">Deadlines</span>
        <span class="legend-item"><span class="legend-swatch open"></span>Open</span>
        <span class="legend-item"><span class="legend-swatch closed"></span>Closed</span>
        <span class="legend-item"><span class="legend-swatch archived"></span>Archived</span>
      </div>
      <div class="legend-group"><span class="legend-title">Weeks</span>
        <span class="legend-item"><span class="legend-swatch teaching"></span>Teaching week</span>
        <span class="legend-item"><span class="legend-swatch none"></span>No homework this week${withoutHomework ? ` (${withoutHomework} this month)` : ''}</span>
      </div>
    </div>
  </section>`;
}

function assignmentListView(assignments) {
  if (!assignments.length) return '<div class="empty-state"><h3>No homework yet</h3><p>Create the first assignment, or click a day on the calendar.</p></div>';
  return `<div class="assignment-grid">${assignments.map((assignment) => {
    const archived = assignment.status === 'archived';
    const closed = assignmentClosed(assignment);
    return `<article class="card assignment-card ${archived ? 'is-archived' : ''}">
      <div class="card-actions"><div><h3>${escapeHtml(assignment.title)}${archived ? '<span class="pill">Archived</span>' : ''}</h3><p>${escapeHtml(assignment.classLabel || '')}</p></div>
      <span class="pill ${archived ? '' : closed ? 'red' : 'green'}">${escapeHtml(fmtDate(assignment.reopened_until || assignment.deadline_at, { time: true, weekday: true, dateStyle: 'short' }))}</span></div>
      <div class="mini-stats"><span class="mini-stat">${assignment.questions?.length || 0} questions</span><span class="mini-stat">${assignment.resources?.length || 0} files</span><span class="mini-stat">${assignment.hard_deadline ? 'Hard deadline' : 'Open submissions'}</span></div>
      <div class="actions stack-top">
        <button class="btn small" data-edit-assignment="${assignment.id}">${svg.edit} Edit</button>
        ${assignment.hard_deadline && !archived ? `<button class="btn small" data-reopen-assignment="${assignment.id}">Reopen</button>` : ''}
        <a class="btn small" href="/api/admin/assignments/${assignment.id}/calendar.ics" download>${svg.calendar} .ics</a>
        <button class="btn small" data-archive-assignment="${assignment.id}" data-archived="${archived}">${archived ? 'Restore' : 'Archive'}</button>
        <button class="btn small danger" data-delete-assignment="${assignment.id}">Delete</button>
      </div>
    </article>`;
  }).join('')}</div>`;
}

/* Weekly check-ins are not automatic in the sense of unstoppable: every week has
   its own switch, its own opening and closing time, and its own choice of hard or
   soft deadline. Christmas week just gets turned off. */
/* Dates a class is unlikely to happen on.
   ------------------------------------------------------------------
   The check-in calendar draws these behind the weeks so that a run of check-ins
   is not scheduled across a fortnight when nobody is teaching. They are marks on
   a calendar and nothing more: nothing is switched off automatically, because a
   course that deliberately runs through a bank holiday is a normal thing and the
   portal should not overrule it.

   Two kinds, and the difference matters.

   PUBLIC HOLIDAYS are fixed in law and are stated here with confidence. Where
   one falls at a weekend the substitute day is the one that is actually taken
   off, so both are listed.

   SCHOOL HOLIDAYS are indicative. The Department publishes standardised breaks
   but individual schools vary within them, and the further out the year the more
   they move. Treat them as a prompt to check rather than as fact — they are
   plain data here precisely so they can be corrected in one place. */

const PUBLIC_HOLIDAYS = [
  // 2026
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-02-02', name: "St Brigid's Day" },
  { date: '2026-03-17', name: "St Patrick's Day" },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-04', name: 'May Bank Holiday' },
  { date: '2026-06-01', name: 'June Bank Holiday' },
  { date: '2026-08-03', name: 'August Bank Holiday' },
  { date: '2026-10-26', name: 'October Bank Holiday' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: "St Stephen's Day" },
  // St Stephen's Day falls on a Saturday in 2026, so the Monday is the day off.
  { date: '2026-12-28', name: "St Stephen's Day (substitute)" },

  // 2027
  { date: '2027-01-01', name: "New Year's Day" },
  { date: '2027-02-01', name: "St Brigid's Day" },
  { date: '2027-03-17', name: "St Patrick's Day" },
  { date: '2027-03-29', name: 'Easter Monday' },
  { date: '2027-05-03', name: 'May Bank Holiday' },
  { date: '2027-06-07', name: 'June Bank Holiday' },
  { date: '2027-08-02', name: 'August Bank Holiday' },
  { date: '2027-10-25', name: 'October Bank Holiday' },
  { date: '2027-12-25', name: 'Christmas Day' },
  { date: '2027-12-26', name: "St Stephen's Day" },
  // Both fall at the weekend in 2027, so both are moved.
  { date: '2027-12-27', name: 'Christmas Day (substitute)' },
  { date: '2027-12-28', name: "St Stephen's Day (substitute)" },
];

/* Ranges are inclusive at both ends. Indicative, per the note above. */
const SCHOOL_HOLIDAYS = [
  { from: '2026-10-26', to: '2026-10-30', name: 'October mid-term' },
  { from: '2026-12-23', to: '2027-01-05', name: 'Christmas holidays' },
  { from: '2027-02-15', to: '2027-02-19', name: 'February mid-term' },
  { from: '2027-03-26', to: '2027-04-05', name: 'Easter holidays' },
  { from: '2027-06-01', to: '2027-06-11', name: 'State examinations' },
];

/** Every date in a range, as YYYY-MM-DD. */
function datesBetween(from, to) {
  const days = [];
  // Stepped in UTC so a summer-time boundary cannot skip or repeat a day.
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * One lookup from date to whatever is on it.
 *
 * A date can carry both — the October mid-term contains the October bank
 * holiday — so the value is a list, and the public holiday is put first because
 * it is the one that is certain.
 */
function holidayIndex() {
  const index = new Map();
  const add = (date, entry) => {
    if (!index.has(date)) index.set(date, []);
    index.get(date).push(entry);
  };
  for (const holiday of PUBLIC_HOLIDAYS) {
    add(holiday.date, { kind: 'public', name: holiday.name });
  }
  for (const holiday of SCHOOL_HOLIDAYS) {
    for (const date of datesBetween(holiday.from, holiday.to)) {
      add(date, { kind: 'school', name: holiday.name });
    }
  }
  for (const entries of index.values()) {
    entries.sort((a, b) => (a.kind === 'public' ? -1 : 1) - (b.kind === 'public' ? -1 : 1));
  }
  return index;
}

/**
 * What falls in the week beginning on a given Monday.
 *
 * The check-in list is organised by week rather than by day, so this is what
 * lets a row say "October bank holiday" without the reader working out which
 * dates the week covers.
 */
function holidaysInWeek(weekStart) {
  const index = holidayIndex();
  const found = [];
  const seen = new Set();
  for (const date of datesBetween(weekStart, addDays(weekStart, 6))) {
    for (const entry of index.get(date) || []) {
      const key = `${entry.kind}:${entry.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ ...entry, date });
    }
  }
  return found;
}

function addDays(date, days) {
  const cursor = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

function checkinsView() {
  const klass = state.classes.find((row) => row.id === state.checkinClassId);
  const weeks = state.teachingWeeks || [];
  const today = toZonedInput(new Date()).slice(0, 10);
  const upcoming = weeks.filter((week) => String(week.week_start).slice(0, 10) >= today).length;
  const off = weeks.filter((week) => week.checkin_enabled === false).length;

  return `${pageHeader('Weekly check-ins', 'Check-in schedule', `Every week has its own switch and its own deadline. Times in ${escapeHtml(classTimezone())}.`,
    `<button class="btn" id="checkin-bulk-off">Turn off selected</button><button class="btn" id="checkin-bulk-on">Turn on selected</button><button class="btn primary" id="checkin-schedule">Create check-ins</button>`)}
    <div class="card toolbar">
      <div class="toolbar-group">
        <select class="select" id="checkin-class">${state.classes.map((row) => `<option value="${row.id}" ${row.id === state.checkinClassId ? 'selected' : ''}>${escapeHtml(classLabel(row))}</option>`).join('')}</select>
        <span class="muted small">${weeks.length} weeks · ${upcoming} still to come · ${off} switched off</span>
      </div>
      <div class="toolbar-group">
        <div class="seg">
          <button class="seg-btn ${state.checkinView === 'calendar' ? '' : 'on'}" data-checkin-view="list">List</button>
          <button class="seg-btn ${state.checkinView === 'calendar' ? 'on' : ''}" data-checkin-view="calendar">Calendar</button>
        </div>
        <button class="btn small" id="checkin-select-none">Clear selection</button>
      </div>
    </div>
    ${state.checkinView === 'calendar' ? checkinCalendar(weeks, today) : `<section class="card table-wrap">
      <table class="data-table checkin-table">
        <thead><tr>
          <th class="pick"><input type="checkbox" id="checkin-select-all" aria-label="Select every week"></th>
          <th>Week</th><th>Check-in</th><th>Opens</th><th>Closes</th><th>Deadline</th><th>Note</th><th></th>
        </tr></thead>
        <tbody>${weeks.map((week) => checkinRow(week, today)).join('') || '<tr><td colspan="8"><div class="empty-state"><h3>No weeks yet</h3><p>Weeks are generated automatically once a class exists.</p></div></td></tr>'}</tbody>
      </table>
    </section>`}
    <p class="muted small stack-top">A <strong>soft</strong> deadline keeps accepting check-ins after it closes, and the tracker shows them as “Open, late” rather than missed. A <strong>hard</strong> deadline closes the form. Switching a week off means no check-in is expected at all, and the tracker shows “Off”.</p>`;
}

/* The term as a calendar.
   ------------------------------------------------------------------
   The list is where a check-in is edited, but it cannot answer the question
   this screen is really for: which weeks should be switched off. That is a
   question about the shape of a term — where the mid-terms fall, which Monday
   is a bank holiday — and a list of dates is the wrong shape to see it in.

   So the same weeks are drawn as months, with the bank holidays and the school
   breaks behind them. Nothing is switched off automatically; a course that
   deliberately runs through a bank holiday is a normal thing. */
function checkinCalendar(weeks, today) {
  if (!weeks.length) {
    return `<section class="card"><div class="empty-state"><h3>No weeks yet</h3>
      <p>Weeks are generated automatically once a class exists.</p></div></section>`;
  }

  const byWeekStart = new Map(weeks.map((week) => [String(week.week_start).slice(0, 10), week]));
  const marks = holidayIndex();

  // Every month the term touches, from its first week to its last.
  const first = String(weeks[0].week_start).slice(0, 10);
  const last = String(weeks[weeks.length - 1].week_start).slice(0, 10);
  const months = [];
  const cursor = new Date(`${first.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${last.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= end) {
    months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return `<section class="cal-wrap">
    <div class="cal-key">
      <span><i class="k-on"></i> Check-in on</span>
      <span><i class="k-off"></i> Switched off</span>
      <span><i class="k-bank"></i> Bank holiday</span>
      <span><i class="k-school"></i> Likely school break</span>
    </div>
    <div class="cal-months">${months.map(({ year, month }) => {
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday first.
      const cells = [
        ...Array.from({ length: lead }, () => '<div class="cal-cell is-blank"></div>'),
        ...Array.from({ length: days }, (_, index) => {
          const date = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
          const onDay = marks.get(date) || [];
          const bank = onDay.find((entry) => entry.kind === 'public');
          const school = onDay.find((entry) => entry.kind === 'school');

          /* A week is owned by its Monday, so every day looks back to the
             Monday it belongs to for the check-in state. */
          const monday = addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
          const week = byWeekStart.get(monday);
          const state_ = week ? (week.checkin_enabled === false ? 'off' : 'on') : null;

          return `<div class="cal-cell ${bank ? 'is-bank' : ''} ${school ? 'is-school' : ''}
              ${date === today ? 'is-today' : ''}"
              ${week ? `data-cal-week="${week.id}" role="button" tabindex="0"` : ''}
              title="${escapeHtml([bank?.name, school?.name].filter(Boolean).join(' · '))}">
            <span class="cal-date">${index + 1}</span>
            ${state_ ? `<span class="cal-dot k-${state_}"></span>` : ''}
            ${bank ? `<span class="cal-tag">${escapeHtml(bank.name.replace(' Bank Holiday', '').replace(' (substitute)', '*'))}</span>` : ''}
          </div>`;
        }),
      ];
      return `<section class="cal-month">
        <h4>${escapeHtml(new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IE', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</h4>
        <div class="cal-grid">
          ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => `<div class="cal-head">${day}</div>`).join('')}
          ${cells.join('')}
        </div>
      </section>`;
    }).join('')}</div>
    <p class="muted small">Bank holidays are exact. School breaks are the usual pattern rather than any one school's calendar — worth checking against the Department's dates before a term is built on them. Click any day to jump to its week.</p>
  </section>`;
}

function checkinRow(week, today) {
  const past = String(week.week_start).slice(0, 10) < today;
  const disabled = week.checkin_enabled === false;
  // Named on the row as well as drawn on the calendar: most of this screen's
  // work happens in the list, and that is where the clash needs to be visible.
  const marks = holidaysInWeek(String(week.week_start).slice(0, 10));
  return `<tr class="${disabled ? 'is-off' : ''} ${past ? 'is-past' : ''}" data-week-row="${week.id}">
    <td class="pick"><input type="checkbox" class="week-pick" value="${week.id}" aria-label="Select week of ${escapeHtml(fmtWeek(week.week_start))}"></td>
    <td><strong>${escapeHtml(fmtWeek(week.week_start))}</strong>${past ? '<span class="muted small"> · past</span>' : ''}</td>
    <td><label class="toggle-row"><span class="toggle"><input type="checkbox" data-week-enabled="${week.id}" ${disabled ? '' : 'checked'}><span></span></span>${disabled ? 'Off' : 'On'}</label></td>
    <td><input type="datetime-local" class="compact" data-week-release="${week.id}" value="${toZonedInput(week.checkin_release_at)}" ${disabled ? 'disabled' : ''}></td>
    <td><input type="datetime-local" class="compact" data-week-due="${week.id}" value="${toZonedInput(week.checkin_due_at)}" ${disabled ? 'disabled' : ''}></td>
    <td><select class="select compact" data-week-hard="${week.id}" ${disabled ? 'disabled' : ''}>
      <option value="hard" ${week.checkin_hard_deadline === false ? '' : 'selected'}>Hard</option>
      <option value="soft" ${week.checkin_hard_deadline === false ? 'selected' : ''}>Soft</option>
    </select></td>
    <td><input class="compact" data-week-label="${week.id}" value="${escapeHtml(week.label || '')}" placeholder="e.g. Christmas week" ${disabled ? '' : ''}>
      ${marks.length ? `<span class="wk-holiday">${marks.map((mark) => escapeHtml(mark.name)).join(' · ')}</span>` : ''}</td>
    <td class="row-actions"><button class="btn small" data-week-save="${week.id}">Save</button>
      <button class="btn small danger" data-week-delete="${week.id}" title="Delete this week">${svg.trash}</button></td>
  </tr>`;
}

const DAY_CHOICES = [1,2,3,4,5,6,7].map((value) => ({ value, label: DAY_NAMES[value] }));

/* Build a term's worth of check-ins in one pass: pick the range and the weekly
   times, then look at exactly which weeks it will create and switch off the ones
   you do not want, before anything is written. */
function openCheckinScheduleModal() {
  const klass = state.classes.find((row) => row.id === state.checkinClassId);
  const today = toZonedInput(new Date()).slice(0, 10);
  const inTwelveWeeks = toZonedInput(new Date(Date.now() + 12 * 7 * 86400000)).slice(0, 10);
  state.scheduleSkips = new Set();

  const dayOptions = (selected) => DAY_CHOICES.map((day) => `<option value="${day.value}" ${day.value === selected ? 'selected' : ''}>${day.label}</option>`).join('');

  modal({
    title: 'Create check-ins',
    subtitle: klass ? classLabel(klass) : '',
    wide: true,
    body: `
      <div class="schedule-grid">
        <div class="form-field"><label for="sched-start">First week</label><input id="sched-start" type="date" value="${today}"></div>
        <div class="form-field"><label for="sched-end">Last week</label><input id="sched-end" type="date" value="${inTwelveWeeks}"></div>
      </div>
      <div class="schedule-grid">
        <div class="form-field"><label for="sched-release-day">Opens to students</label>
          <div class="inline-fields"><select id="sched-release-day">${dayOptions(5)}</select><input id="sched-release-time" type="time" value="10:00"></div>
          <div class="muted small">Students cannot see a check-in before this.</div>
        </div>
        <div class="form-field"><label for="sched-due-day">Closes</label>
          <div class="inline-fields"><select id="sched-due-day">${dayOptions(7)}</select><input id="sched-due-time" type="time" value="23:45"></div>
          <div class="muted small">Times are ${escapeHtml(classTimezone())}.</div>
        </div>
      </div>
      <label class="toggle-row"><span class="toggle"><input id="sched-hard" type="checkbox" checked><span></span></span>Hard deadline, the form closes when it is due</label>
      <div class="section-title">Weeks this will create</div>
      <p class="muted small">Untick any week you do not want a check-in to go out. It stays on the tracker as a teaching week, but nothing is asked of the students.</p>
      <div id="sched-preview" class="schedule-preview"></div>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="sched-apply">Create check-ins</button>`,
    onOpen() {
      const refresh = () => renderSchedulePreview();
      ['sched-start','sched-end','sched-release-day','sched-release-time','sched-due-day','sched-due-time'].forEach((id) => {
        document.getElementById(id).addEventListener('change', refresh);
      });
      renderSchedulePreview();
      document.getElementById('sched-apply').addEventListener('click', applyCheckinSchedule);
    },
  });
}

/** Every Monday between the two dates, so the exceptions can be picked by eye. */
function scheduleWeeks() {
  const start = document.getElementById('sched-start').value;
  const end = document.getElementById('sched-end').value;
  if (!start || !end) return [];
  const toMonday = (value) => {
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date;
  };
  const first = toMonday(start), last = toMonday(end);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return [];
  const weeks = [];
  for (let cursor = first; cursor <= last && weeks.length <= 106; cursor = new Date(cursor.getTime() + 7 * 86400000)) {
    weeks.push(cursor.toISOString().slice(0, 10));
  }
  return weeks;
}

function renderSchedulePreview() {
  const target = document.getElementById('sched-preview');
  const weeks = scheduleWeeks();
  const releaseDay = Number(document.getElementById('sched-release-day').value);
  const releaseTime = document.getElementById('sched-release-time').value || '10:00';
  const dueDay = Number(document.getElementById('sched-due-day').value);
  const dueTime = document.getElementById('sched-due-time').value || '23:45';

  if (!weeks.length) {
    target.innerHTML = '<div class="empty-state"><h3>No weeks in that range</h3><p>Check the first and last week.</p></div>';
    return;
  }
  if (weeks.length > 105) {
    target.innerHTML = '<div class="error-banner">That range covers more than two years. Choose a shorter run.</div>';
    return;
  }

  const dayLabel = (monday, day) => {
    const date = new Date(`${monday}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day - 1);
    return new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
  };
  const on = weeks.filter((week) => !state.scheduleSkips.has(week)).length;

  target.innerHTML = `<div class="schedule-summary"><strong>${on} check-in${on === 1 ? '' : 's'}</strong> across ${weeks.length} week${weeks.length === 1 ? '' : 's'}${weeks.length - on ? ` · ${weeks.length - on} skipped` : ''}</div>
    <ul class="schedule-list">${weeks.map((week) => {
      const skipped = state.scheduleSkips.has(week);
      return `<li class="${skipped ? 'is-skipped' : ''}">
        <label class="toggle-row"><span class="toggle"><input type="checkbox" data-sched-week="${week}" ${skipped ? '' : 'checked'}><span></span></span>
          <span class="schedule-week"><strong>Week of ${escapeHtml(fmtWeek(week))}</strong>
          <span>${skipped ? 'No check-in this week' : `Opens ${escapeHtml(dayLabel(week, releaseDay))} at ${escapeHtml(releaseTime)} · closes ${escapeHtml(dayLabel(week, dueDay))} at ${escapeHtml(dueTime)}`}</span></span>
        </label>
      </li>`;
    }).join('')}</ul>`;

  target.querySelectorAll('[data-sched-week]').forEach((box) => box.addEventListener('change', () => {
    if (box.checked) state.scheduleSkips.delete(box.dataset.schedWeek);
    else state.scheduleSkips.add(box.dataset.schedWeek);
    renderSchedulePreview();
  }));
}

/* Deleting a week, as opposed to switching its check-in off.
   ------------------------------------------------------------------
   Off is the right answer for a bank holiday: the week stays in the tracker as
   a deliberate gap, and everything already in it is kept. Delete is for a week
   that should never have existed — a term built two weeks too long, or a run
   created against the wrong dates.

   Because the two are one click apart and only one of them is reversible, the
   confirmation says what is in the week and points back at the other option. */
async function confirmDeleteWeek(weekId) {
  let impact;
  try { impact = await api(`/api/admin/weeks/${weekId}/impact`); }
  catch (error) { return showToast(error.message, 'error'); }

  if (impact.assignments > 0) {
    return showToast(
      `This week still carries ${impact.assignments} assignment${impact.assignments === 1 ? '' : 's'}. Delete or move ${impact.assignments === 1 ? 'it' : 'them'} first.`,
      'error',
    );
  }

  const ok = await askConfirm({
    title: `Delete the week of ${fmtWeek(impact.week_start)}?`,
    message: impact.work
      ? `It holds ${impact.checkins} submitted check-in${impact.checkins === 1 ? '' : 's'} and ${impact.attendance} attendance record${impact.attendance === 1 ? '' : 's'}, and they go with it. This cannot be undone — switching the check-in off instead keeps the week and everything in it.`
      : 'Nothing has been submitted for this week, so nothing else goes with it.',
    confirmLabel: 'Delete week', danger: true,
  });
  if (!ok) return;

  try {
    // The count is sent back so the server can refuse a stale confirmation —
    // work submitted between the warning and the click must not be lost.
    await api(`/api/admin/weeks/${weekId}?confirmWork=${impact.work}`, { method: 'DELETE' });
    state.teachingWeeks = await api(`/api/admin/teaching-weeks?classId=${state.checkinClassId}`);
    renderAdmin();
    showToast('Week deleted');
  } catch (error) { showToast(error.message, 'error'); }
}

async function applyCheckinSchedule() {
  const weeks = scheduleWeeks();
  if (!weeks.length) return showToast('Choose a first and last week', 'error');
  const [releaseHour, releaseMinute] = (document.getElementById('sched-release-time').value || '10:00').split(':').map(Number);
  const [dueHour, dueMinute] = (document.getElementById('sched-due-time').value || '23:45').split(':').map(Number);
  const button = document.getElementById('sched-apply');
  button.disabled = true; button.textContent = 'Creating…';
  try {
    const result = await api(`/api/admin/classes/${state.checkinClassId}/checkin-schedule`, {
      method: 'POST',
      body: {
        startDate: weeks[0],
        endDate: weeks.at(-1),
        skipWeekStarts: [...state.scheduleSkips],
        releaseDay: Number(document.getElementById('sched-release-day').value),
        releaseHour, releaseMinute,
        dueDay: Number(document.getElementById('sched-due-day').value),
        dueHour, dueMinute,
        hardDeadline: document.getElementById('sched-hard').checked,
      },
    });
    closeModal();
    await renderAdmin();
    showToast(`${result.created} week${result.created === 1 ? '' : 's'} created, ${result.updated} updated${result.skipped ? `, ${result.skipped} left switched off` : ''}`);
  } catch (error) {
    showToast(error.message, 'error');
    button.disabled = false; button.textContent = 'Create check-ins';
  }
}

function bindCheckins() {
  const classSelect = document.getElementById('checkin-class');
  if (!classSelect) return;
  classSelect.addEventListener('change', async () => { state.checkinClassId = classSelect.value; await renderAdmin(); });
  document.getElementById('checkin-select-all')?.addEventListener('change', (event) => {
    document.querySelectorAll('.week-pick').forEach((box) => { box.checked = event.target.checked; });
  });
  document.getElementById('checkin-select-none')?.addEventListener('click', () => {
    document.querySelectorAll('.week-pick').forEach((box) => { box.checked = false; });
    document.getElementById('checkin-select-all').checked = false;
  });

  const picked = () => [...document.querySelectorAll('.week-pick:checked')].map((box) => box.value);
  const bulk = async (enabled) => {
    const weekIds = picked();
    if (!weekIds.length) return showToast('Select some weeks first', 'error');
    try {
      const result = await api('/api/admin/weeks/bulk-checkin', { method: 'POST', body: { weekIds, enabled } });
      await renderAdmin();
      showToast(`${result.updated} week${result.updated === 1 ? '' : 's'} turned ${enabled ? 'on' : 'off'}`);
    } catch (error) { showToast(error.message, 'error'); }
  };
  document.getElementById('checkin-schedule')?.addEventListener('click', openCheckinScheduleModal);

  document.querySelectorAll('[data-checkin-view]').forEach((button) =>
    button.addEventListener('click', () => {
      state.checkinView = button.dataset.checkinView;
      renderAdmin();
    }));

  /* A day on the calendar is a way into its week, so clicking one goes back to
     the list with that row highlighted — the calendar answers "which weeks",
     the list is where they are changed. */
  document.querySelectorAll('[data-cal-week]').forEach((cell) => {
    const open = () => {
      state.checkinView = 'list';
      state.highlightWeek = cell.dataset.calWeek;
      renderAdmin();
      const row = document.querySelector(`[data-week-row="${cell.dataset.calWeek}"]`);
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row?.classList.add('is-found');
    };
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
  });

  document.querySelectorAll('[data-week-delete]').forEach((button) =>
    button.addEventListener('click', () => confirmDeleteWeek(button.dataset.weekDelete)));
  document.getElementById('checkin-bulk-off')?.addEventListener('click', () => bulk(false));
  document.getElementById('checkin-bulk-on')?.addEventListener('click', () => bulk(true));

  // Toggling a week takes effect immediately; the times need an explicit save.
  document.querySelectorAll('[data-week-enabled]').forEach((box) => box.addEventListener('change', async () => {
    try {
      await api(`/api/admin/weeks/${box.dataset.weekEnabled}/checkin`, { method: 'PUT', body: { enabled: box.checked } });
      await renderAdmin();
      showToast(box.checked ? 'Check-in switched on' : 'Check-in switched off for that week');
    } catch (error) { showToast(error.message, 'error'); }
  }));

  document.querySelectorAll('[data-week-save]').forEach((button) => button.addEventListener('click', async () => {
    const id = button.dataset.weekSave;
    const value = (attribute) => document.querySelector(`[data-week-${attribute}="${id}"]`);
    try {
      await api(`/api/admin/weeks/${id}/checkin`, {
        method: 'PUT',
        body: {
          releaseAt: fromZonedInput(value('release').value),
          dueAt: fromZonedInput(value('due').value),
          hardDeadline: value('hard').value === 'hard',
          label: value('label').value.trim() || null,
        },
      });
      showToast('Week saved');
    } catch (error) { showToast(error.message, 'error'); }
  }));
}

/* ------------------------------------------------------------------
   Courses.

   A shelf of course cards, then a lesson page: the recording large at the top,
   the notes under it, and the contents beside it with a tick against everything
   already watched. One implementation for both roles — the administrator gets
   editing controls in the same places rather than a separate screen, because a
   course being built and a course being taken are the same thing seen twice.
   ------------------------------------------------------------------ */

const courseApi = () => (isAdmin() ? '/api/admin' : '/api/student');

async function loadCourses() {
  try { state.courses = (await api(`${courseApi()}/courses`)).courses; }
  catch (error) { showToast(error.message, 'error'); state.courses = []; }
}

async function openCourse(courseId, lessonId = null) {
  try { state.course = await api(`${courseApi()}/courses/${courseId}`); }
  catch (error) { return showToast(error.message, 'error'); }
  // Straight to where they left off, unless a particular lesson was asked for.
  state.lessonId = lessonId || state.course.resumeLessonId;
  renderCourseView();
}

/* Which of the two course screens to draw.
   ------------------------------------------------------------------
   The administrator path used to render the lesson page unconditionally, so
   pressing "All courses" cleared the course and then drew a page for the course
   that was no longer there — an empty screen with no way back except a reload.
   Both roles now pick the same way: a course in hand means the lesson page,
   otherwise the shelf. */
function renderCourseView() {
  state.view = 'courses';
  if (isAdmin()) {
    shell({
      nav: adminNav(),
      content: state.course ? coursePage() : coursesView(),
      title: 'Courses',
      roleLabel: 'Administrator',
    });
    bindAdminView();
  } else {
    renderStudent();
  }
  bindCourse();
}

const allLessons = (course) => (course?.modules || []).flatMap((module) => module.lessons);
const currentLesson = () => allLessons(state.course).find((lesson) => lesson.id === state.lessonId) || null;

/* ---- The shelf --------------------------------------------------- */

function courseCard(course) {
  const percent = course.percent || 0;
  const lessons = course.lesson_count || 0;
  return `<article class="cc" data-open-course="${course.id}">
    <div class="cc-cover" ${course.cover_url ? `style="background-image:url('${escapeHtml(course.cover_url)}')"` : ''}>
      ${course.cover_url ? '' : `<span>${escapeHtml(initials(course.title))}</span>`}
      ${course.published === false ? '<b class="cc-draft">Draft</b>' : ''}
      ${isAdmin() ? `<button type="button" class="cc-menu" data-course-menu="${course.id}"
        aria-label="Manage ${escapeHtml(course.title)}" title="Manage this course">${svg.dots}</button>` : ''}
    </div>
    <div class="cc-body">
      <h3>${escapeHtml(course.title)}</h3>
      ${course.description ? `<p>${escapeHtml(course.description)}</p>` : ''}
      <div class="cc-foot">
        <span class="cc-count">${lessons} ${lessons === 1 ? 'lesson' : 'lessons'}</span>
        ${isAdmin()
          // Who a course reaches is the thing most easily got wrong, so it is on
          // the card rather than one click inside the settings.
          ? `<span class="cc-who">${course.open_to_all
              ? 'Every class'
              : (course.classes?.length
                  ? `${course.classes.length} class${course.classes.length === 1 ? '' : 'es'}`
                  : 'No class yet')}</span>`
          : `<span class="cc-pct">${percent}%</span>`}
      </div>
      ${isAdmin() ? '' : `<div class="cc-bar"><span style="width:${percent}%"></span></div>`}
    </div>
  </article>`;
}

function coursesView() {
  const courses = state.courses || [];
  const body = courses.length
    ? `<div class="cc-grid">${courses.map(courseCard).join('')}</div>`
    : `<div class="feed-empty"><h3>No courses yet</h3><p>${isAdmin()
        ? 'Create one, add a section for each term, then a lesson for each class recording.'
        : 'Your class recordings will appear here once your teacher has added them.'}</p></div>`;

  if (isAdmin()) {
    return `<div class="feed-head">
        <div><h1>Courses</h1><p>Class recordings and the notes that go with them.</p></div>
        <div class="feed-head-actions">
          <button class="btn" id="open-zoom">Import from Zoom</button>
          <button class="btn primary" id="new-course">New course</button>
        </div>
      </div>${body}`;
  }
  return `${studentHeader()}${body}`;
}

/* ---- One course -------------------------------------------------- */

/* The player. An embedded host gets an iframe; a file we hold gets a plain
   <video>, which also lets us put somebody back where they stopped. */
function lessonPlayer(lesson) {
  if (!lesson) return '<div class="lp-empty">Pick a lesson from the list.</div>';
  if (!lesson.video) {
    return `<div class="lp-empty">
      <strong>No recording yet</strong>
      <span>${isAdmin() ? 'Add one by editing this lesson.' : 'This lesson has notes only for now.'}</span>
    </div>`;
  }
  if (lesson.video.type === 'iframe') {
    return `<div class="lp-frame"><iframe src="${escapeHtml(lesson.video.src)}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="${escapeHtml(lesson.title)}"></iframe></div>`;
  }
  return `<div class="lp-frame"><video id="lesson-video" controls playsinline preload="metadata"
    src="${escapeHtml(lesson.video.src)}"></video></div>`;
}

/* One lesson in the contents list. A row rather than a single button, because
   for an administrator it carries its own menu, and a button cannot live inside
   a button. For a student it is exactly what it was. */
function lessonRow(lesson, index, active, place = null) {
  const admin = isAdmin();
  return `<div class="ll-row ${active ? 'on' : ''}">
    <button class="ll ${active ? 'on' : ''} ${lesson.completed ? 'done' : ''} ${lesson.published === false ? 'draft' : ''}"
      data-open-lesson="${lesson.id}">
      <span class="ll-tick">${lesson.completed ? svg.tick : `<i>${index}</i>`}</span>
      <span class="ll-copy">
        <strong>${escapeHtml(lesson.title)}</strong>
        <span>${lesson.durationLabel ? escapeHtml(lesson.durationLabel) : ''}${lesson.published === false ? ' · Draft' : ''}</span>
      </span>
    </button>
    ${admin && place ? `<button class="ll-menu" data-lesson-menu="${lesson.id}"
      data-module-id="${place.moduleId}" data-lesson-index="${place.lessonIndex}"
      aria-label="Manage ${escapeHtml(lesson.title)}" title="Manage this lesson">${svg.dots}</button>` : ''}
  </div>`;
}

function courseContents() {
  const course = state.course;
  let number = 0;
  return `<aside class="lc">
    <div class="lc-head">
      <strong>${escapeHtml(course.title)}</strong>
      ${isAdmin() ? '' : `<span>${course.completedCount} of ${course.lessonCount} done</span>
        <div class="cc-bar"><span style="width:${course.percent}%"></span></div>`}
    </div>
    ${course.modules.map((module, moduleIndex) => `<section class="lc-mod">
      <h4>
        <span class="lc-mod-title">${escapeHtml(module.title)}</span>
        ${isAdmin() ? `<span class="lc-mod-tools">
          <button class="lc-add" data-add-lesson="${module.id}" title="Add a lesson" aria-label="Add a lesson to ${escapeHtml(module.title)}">+</button>
          <button class="lc-add" data-module-menu="${module.id}" data-module-index="${moduleIndex}"
            title="Manage this section" aria-label="Manage ${escapeHtml(module.title)}">${svg.dots}</button>
        </span>` : ''}
      </h4>
      ${module.lessons.map((lesson, lessonIndex) => lessonRow(
          lesson, (number += 1), lesson.id === state.lessonId,
          { moduleId: module.id, moduleIndex, lessonIndex, lessonCount: module.lessons.length }))
        .join('')
        || '<p class="lc-empty">No lessons in this section yet.</p>'}
    </section>`).join('')}
    ${isAdmin() ? '<button class="btn small lc-newmod" id="add-module">Add a section</button>' : ''}
  </aside>`;
}

function coursePage() {
  const course = state.course;
  if (!course) return '';
  const lesson = currentLesson();
  const lessons = allLessons(course);
  const at = lessons.findIndex((item) => item.id === state.lessonId);
  const next = at >= 0 ? lessons[at + 1] : null;

  return `<div class="cp">
    <div class="cp-top">
      <button class="cp-back" id="back-to-courses">${svg.chevronLeft} All courses</button>
      ${isAdmin() ? `<div class="cp-top-right">
        ${course.published === false ? '<span class="pill">Draft</span>' : ''}
        <button class="btn small" id="course-edit">Edit course</button>
        <button class="btn small" id="course-manage" aria-label="More course actions">${svg.dots}</button>
      </div>` : ''}
    </div>
    <div class="cp-main">
      <div class="cp-stage">
        ${lessonPlayer(lesson)}
        ${lesson ? `<div class="cp-meta">
          <div>
            <h1>${escapeHtml(lesson.title)}</h1>
            <span>${lesson.recordedOn ? `Recorded ${escapeHtml(fmtDate(lesson.recordedOn, { dateStyle: 'medium' }))}` : ''}${lesson.durationLabel ? `${lesson.recordedOn ? ' · ' : ''}${escapeHtml(lesson.durationLabel)}` : ''}</span>
          </div>
          <div class="cp-actions">
            ${isAdmin()
              ? `<button class="btn small" data-edit-lesson="${lesson.id}">Edit lesson</button>
                 <button class="btn small danger" data-delete-lesson="${lesson.id}">Delete</button>`
              : `<button class="btn ${lesson.completed ? 'is-done' : 'primary'}" id="toggle-complete"
                   data-lesson="${lesson.id}" data-done="${lesson.completed}"
                   aria-pressed="${Boolean(lesson.completed)}"
                   title="${lesson.completed ? 'Click to mark as not complete' : 'Mark this lesson complete'}">
                   ${lesson.completed ? `${svg.tick} Completed` : 'Mark as complete'}
                 </button>
                 ${next ? `<button class="btn" data-open-lesson="${next.id}">Next lesson</button>` : ''}`}
          </div>
        </div>
        ${lesson.notes ? `<div class="cp-notes">${escapeHtml(lesson.notes).replace(/\n/g, '<br>')}</div>` : ''}
        ${lesson.attachments?.length ? attachmentsPreview(lesson.attachments.map((item) => ({ ...item, kind: 'file' })), true) : ''}` : ''}
      </div>
      ${courseContents()}
    </div>
  </div>`;
}

function bindCourse() {
  document.querySelectorAll('[data-open-course]').forEach((card) =>
    card.addEventListener('click', () => openCourse(card.dataset.openCourse)));
  document.getElementById('back-to-courses')?.addEventListener('click', async () => {
    state.course = null;
    state.lessonId = null;
    await loadCourses();
    renderCourseView();
  });
  document.querySelectorAll('[data-open-lesson]').forEach((button) =>
    button.addEventListener('click', () => {
      state.lessonId = button.dataset.openLesson;
      renderCourseView();
      document.querySelector('.cp-stage')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }));

  document.getElementById('toggle-complete')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const done = button.dataset.done === 'true';
    try {
      await api(`/api/student/lessons/${button.dataset.lesson}/progress`, {
        method: 'POST', body: { completed: !done },
      });
    } catch (error) { return showToast(error.message, 'error'); }
    await openCourse(state.course.id, state.lessonId);
    showToast(done ? 'Marked as not complete' : 'Marked as complete');
  });

  /* Watching most of it is what finishing a lesson means, so it ticks itself.
     The button stays for anybody who wants to mark it early or undo it. */
  const video = document.getElementById('lesson-video');
  if (video) {
    const lesson = currentLesson();
    if (lesson?.lastPositionSeconds > 5) video.currentTime = lesson.lastPositionSeconds;
    video.addEventListener('timeupdate', debounce(async () => {
      if (!video.duration) return;
      const done = video.currentTime / video.duration > 0.9;
      if (done && !currentLesson()?.completed) {
        await api(`/api/student/lessons/${lesson.id}/progress`, {
          method: 'POST', body: { completed: true, positionSeconds: Math.floor(video.currentTime) },
        }).catch(() => {});
        await openCourse(state.course.id, state.lessonId);
      }
    }, 4000));
  }

  if (isAdmin()) bindCourseAdmin();
}

/* ---- Building a course ------------------------------------------- */

function bindCourseAdmin() {
  document.getElementById('new-course')?.addEventListener('click', () => openCourseModal());
  document.getElementById('open-zoom')?.addEventListener('click', openZoomImport);

  // The card menu, on the courses grid.
  document.querySelectorAll('[data-course-menu]').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.stopPropagation(); // The card itself opens the course.
      const course = (state.courses || []).find((row) => row.id === button.dataset.courseMenu);
      if (course) actionMenu(button, courseActions(course));
    }));

  // The same actions from inside the course.
  document.getElementById('course-edit')?.addEventListener('click', () => openCourseModal(state.course));
  document.getElementById('course-manage')?.addEventListener('click', (event) => {
    event.stopPropagation();
    actionMenu(event.currentTarget, courseActions(state.course));
  });

  document.getElementById('add-module')?.addEventListener('click', () => openSectionModal());
  document.querySelectorAll('[data-add-lesson]').forEach((button) =>
    button.addEventListener('click', (event) => { event.stopPropagation(); openLessonModal(button.dataset.addLesson); }));

  // Section menu: rename, move, delete.
  document.querySelectorAll('[data-module-menu]').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const index = Number(button.dataset.moduleIndex);
      const module = state.course.modules[index];
      const last = state.course.modules.length - 1;
      actionMenu(button, [
        { label: 'Rename section', icon: svg.pencil, run: () => openSectionModal(module) },
        ...(index > 0 ? [{ label: 'Move up', icon: svg.arrowUp, run: () => moveModule(index, -1) }] : []),
        ...(index < last ? [{ label: 'Move down', icon: svg.arrowDown, run: () => moveModule(index, 1) }] : []),
        { separator: true },
        { label: 'Delete section', icon: svg.trash, danger: true, run: () => confirmDeleteSection(module) },
      ]);
    }));

  // Lesson menu, on every row rather than only the one being watched.
  document.querySelectorAll('[data-lesson-menu]').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const moduleIndex = state.course.modules.findIndex((row) => row.id === button.dataset.moduleId);
      const module = state.course.modules[moduleIndex];
      const lessonIndex = Number(button.dataset.lessonIndex);
      const lesson = module.lessons[lessonIndex];
      const published = lesson.published !== false;
      const others = state.course.modules.filter((row) => row.id !== module.id);
      actionMenu(button, [
        { label: 'Edit lesson', icon: svg.pencil, run: () => openLessonModal(null, lesson) },
        {
          label: published ? 'Unpublish' : 'Publish',
          icon: published ? svg.eyeOff : svg.eye,
          run: () => setLessonPublished(lesson, !published),
        },
        ...(lessonIndex > 0 ? [{ label: 'Move up', icon: svg.arrowUp, run: () => moveLesson(moduleIndex, lessonIndex, -1) }] : []),
        ...(lessonIndex < module.lessons.length - 1
          ? [{ label: 'Move down', icon: svg.arrowDown, run: () => moveLesson(moduleIndex, lessonIndex, 1) }] : []),
        ...(others.length ? [{ label: 'Move to another section…', icon: svg.copy, run: () => openMoveLesson(lesson, module) }] : []),
        { separator: true },
        { label: 'Delete lesson', icon: svg.trash, danger: true, run: () => confirmDeleteLesson(lesson) },
      ]);
    }));

  // The buttons beside the player still work on whatever is open.
  document.querySelectorAll('[data-edit-lesson]').forEach((button) =>
    button.addEventListener('click', () => openLessonModal(null, currentLesson())));
  document.querySelectorAll('[data-delete-lesson]').forEach((button) =>
    button.addEventListener('click', () => confirmDeleteLesson(currentLesson())));
}

/* Naming a section. This used to be window.prompt, which returns false without
   asking anything inside a sandboxed iframe — the section simply never got
   made, with nothing on screen to say why. */
function openSectionModal(module = null) {
  modal({
    title: module ? 'Rename section' : 'Add a section',
    subtitle: 'A section groups the recordings — a term, a module, a theme.',
    body: `<form id="section-form"><div class="form-field"><label>Section name</label>
      <input name="title" required maxlength="200" value="${escapeHtml(module?.title || '')}" placeholder="Term 1: Foundations"></div></form>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="save-section">${module ? 'Save' : 'Add section'}</button>`,
    onOpen() {
      const input = document.querySelector('#section-form input');
      input.focus();
      input.select();
      const save = async () => {
        const title = input.value.trim();
        if (!title) return showToast('Give the section a name.', 'error');
        try {
          if (module) await api(`/api/admin/modules/${module.id}`, { method: 'PATCH', body: { title } });
          else await api(`/api/admin/courses/${state.course.id}/modules`, { method: 'POST', body: { title } });
          closeModal();
          await openCourse(state.course.id, state.lessonId);
          showToast(module ? 'Section renamed' : 'Section added');
        } catch (error) { showToast(error.message, 'error'); }
      };
      document.getElementById('save-section').addEventListener('click', save);
      document.getElementById('section-form').addEventListener('submit', (event) => { event.preventDefault(); save(); });
    },
  });
}

async function confirmDeleteSection(module) {
  let impact;
  try { impact = await api(`/api/admin/modules/${module.id}/impact`); }
  catch (error) { return showToast(error.message, 'error'); }
  const ok = await askConfirm({
    title: `Delete “${module.title}”?`,
    message: impact.lessons
      ? `${impact.lessons} lesson${impact.lessons === 1 ? '' : 's'} and ${impact.progress} record${impact.progress === 1 ? '' : 's'} of students having watched them go with it. This cannot be undone — move the lessons to another section first if you want to keep them.`
      : 'This section is empty, so nothing else goes with it.',
    confirmLabel: 'Delete section', danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/admin/modules/${module.id}`, { method: 'DELETE' });
    await openCourse(state.course.id);
    showToast('Section deleted');
  } catch (error) { showToast(error.message, 'error'); }
}

async function confirmDeleteLesson(lesson) {
  if (!lesson) return;
  const ok = await askConfirm({
    title: `Delete “${lesson.title}”?`,
    message: 'The recording link and everybody’s record of having watched it go with it. This cannot be undone — to take it off students’ screens without losing it, unpublish it instead.',
    confirmLabel: 'Delete lesson', danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/admin/lessons/${lesson.id}`, { method: 'DELETE' });
    // Whatever was open may be the thing just deleted, so let the course decide.
    state.lessonId = null;
    await openCourse(state.course.id);
    showToast('Lesson deleted');
  } catch (error) { showToast(error.message, 'error'); }
}

/* Taking one recording off students' screens without deleting it — the usual
   reason being that it was published before it was ready. */
async function setLessonPublished(lesson, published) {
  try {
    await api(`/api/admin/lessons/${lesson.id}`, { method: 'PATCH', body: { title: lesson.title, published } });
    await openCourse(state.course.id, state.lessonId);
    showToast(published ? 'Lesson published' : 'Lesson hidden from students');
  } catch (error) { showToast(error.message, 'error'); }
}

/* Order.
   ------------------------------------------------------------------
   The whole shape of the course is sent each time rather than a single move,
   which is what the server's order route already expected and nothing had ever
   called. Rearranging locally first means the list is only ever saved in a
   state we have actually drawn. */
function currentOrder() {
  return state.course.modules.map((module) => ({
    id: module.id,
    lessons: module.lessons.map((lesson) => lesson.id),
  }));
}

async function saveOrder(modules) {
  try {
    await api(`/api/admin/courses/${state.course.id}/order`, { method: 'PUT', body: { modules } });
    await openCourse(state.course.id, state.lessonId);
  } catch (error) { showToast(error.message, 'error'); }
}

async function moveModule(index, by) {
  const modules = currentOrder();
  const target = index + by;
  if (target < 0 || target >= modules.length) return;
  [modules[index], modules[target]] = [modules[target], modules[index]];
  await saveOrder(modules);
}

async function moveLesson(moduleIndex, lessonIndex, by) {
  const modules = currentOrder();
  const lessons = modules[moduleIndex].lessons;
  const target = lessonIndex + by;
  if (target < 0 || target >= lessons.length) return;
  [lessons[lessonIndex], lessons[target]] = [lessons[target], lessons[lessonIndex]];
  await saveOrder(modules);
}

/* Moving a lesson to a different section. It goes to the end of wherever it
   lands, which is nearly always where a recording being filed belongs; from
   there it can be nudged up. */
function openMoveLesson(lesson, from) {
  const others = state.course.modules.filter((row) => row.id !== from.id);
  modal({
    title: 'Move to another section',
    subtitle: `“${lesson.title}” is in ${from.title}.`,
    body: `<form id="move-form"><div class="form-field"><label>Move it to</label>
      <select name="moduleId">${others.map((row) => `<option value="${row.id}">${escapeHtml(row.title)}</option>`).join('')}</select>
      <p class="muted small">It goes to the end of that section. Nobody’s record of having watched it is affected.</p>
    </div></form>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="save-move">Move lesson</button>`,
    onOpen() {
      document.getElementById('save-move').addEventListener('click', async () => {
        const to = document.querySelector('#move-form select').value;
        const modules = currentOrder();
        for (const module of modules) module.lessons = module.lessons.filter((id) => id !== lesson.id);
        modules.find((module) => module.id === to)?.lessons.push(lesson.id);
        closeModal();
        await saveOrder(modules);
        showToast('Lesson moved');
      });
    },
  });
}

/* The cover photo for a course, in the same uploader the rest of the app uses.
   A course without one falls back to its initials on a tint rather than a photo
   somebody has to find, so this is genuinely optional. */
function coverField(current = '') {
  return `<input type="hidden" name="coverUrl" id="cover-url" value="${escapeHtml(current)}">
    <div class="cover-field" id="cover-field">
      <div class="cover-preview ${current ? 'has-image' : ''}" id="cover-preview"
        ${current ? `style="background-image:url('${escapeHtml(current)}')"` : ''}></div>
      <div class="fu-zone cover-zone">
        <input class="fu-input" type="file" id="cover-input" accept="image/png,image/jpeg,image/webp">
        <span class="fu-icon">${svg.upload || ''}</span>
        <span class="fu-lead"><b>Click to upload</b> or drag a photo here</span>
        <span class="fu-hint">PNG, JPG or WEBP. Landscape works best.</span>
      </div>
      ${current ? '<button type="button" class="btn subtle small" id="cover-clear">Remove photo</button>' : ''}
    </div>`;
}

function bindCoverField() {
  const input = document.getElementById('cover-input');
  const zone = input?.closest('.fu-zone');
  if (!input) return;
  const preview = document.getElementById('cover-preview');
  const hidden = document.getElementById('cover-url');

  const send = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return showToast('Choose an image file.', 'error');
    const form = new FormData();
    form.append('files', file);
    zone.classList.add('is-busy');
    try {
      const uploaded = await api('/api/admin/uploads', { method: 'POST', body: form });
      const url = uploaded.files?.[0]?.url;
      if (!url) throw new Error('The upload did not come back.');
      hidden.value = url;
      preview.style.backgroundImage = `url('${url}')`;
      preview.classList.add('has-image');
    } catch (error) { showToast(error.message, 'error'); }
    finally { zone.classList.remove('is-busy'); }
  };

  input.addEventListener('change', () => send(input.files?.[0]));
  ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault(); zone.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, () => zone.classList.remove('is-over')));
  zone.addEventListener('drop', (event) => { event.preventDefault(); send(event.dataTransfer?.files?.[0]); });
  document.getElementById('cover-clear')?.addEventListener('click', () => {
    hidden.value = '';
    preview.style.backgroundImage = '';
    preview.classList.remove('has-image');
  });
}

/* Managing a course.
   ------------------------------------------------------------------
   Everything the server could already do to a course had no way of being asked
   for: the settings dialog existed but nothing ever opened it with a course in
   hand, so a course, once made, could not be renamed, unpublished, copied or
   removed. This is that menu, on the card and again on the course itself.

   A small popover rather than a dialog, because these are one-click actions and
   a modal for "unpublish" is a modal too many. */
function actionMenu(anchorElement, items) {
  document.querySelectorAll('.pop-menu').forEach((open) => open.remove());
  const menu = document.createElement('div');
  menu.className = 'pop-menu';
  menu.innerHTML = items.map((item, index) => (item.separator
    ? '<hr>'
    : `<button type="button" class="pop-item ${item.danger ? 'is-danger' : ''}" data-index="${index}">
        ${item.icon || ''}<span>${escapeHtml(item.label)}</span>
      </button>`)).join('');
  document.body.append(menu);

  /* Positioned against the button, then nudged back on screen if it would hang
     off the bottom or the right — a menu on the last card in a row would
     otherwise open into nowhere. */
  const box = anchorElement.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const left = Math.min(box.left, window.innerWidth - width - 12);
  const top = box.bottom + height + 12 > window.innerHeight
    ? Math.max(12, box.top - height - 6)
    : box.bottom + 6;
  menu.style.left = `${Math.max(12, left)}px`;
  menu.style.top = `${top}px`;

  menu.querySelectorAll('.pop-item').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.remove();
    items[Number(button.dataset.index)].run?.();
  }));

  const close = () => { menu.remove(); document.removeEventListener('click', close); };
  // Deferred, or the click that opened it closes it again.
  setTimeout(() => document.addEventListener('click', close), 0);
  document.addEventListener('keydown', function escape(event) {
    if (event.key !== 'Escape') return;
    close();
    document.removeEventListener('keydown', escape);
  });
}

/** The management actions for one course, used from the card and the course page. */
function courseActions(course) {
  const published = course.published !== false;
  return [
    { label: 'Edit course', icon: svg.pencil, run: () => openCourseModal(course) },
    {
      label: published ? 'Unpublish' : 'Publish',
      icon: published ? svg.eyeOff : svg.eye,
      run: () => setCoursePublished(course, !published),
    },
    { label: 'Duplicate', icon: svg.copy, run: () => duplicateCourse(course) },
    { separator: true },
    { label: 'Delete course', icon: svg.trash, danger: true, run: () => confirmDeleteCourse(course) },
  ];
}

/* Unpublishing is the reversible one, so it happens on the spot and says what it
   did. It is also how a past course is put away without losing it. */
async function setCoursePublished(course, published) {
  try {
    await api(`/api/admin/courses/${course.id}`, { method: 'PATCH', body: { published } });
    await refreshCourses(course.id);
    showToast(published ? 'Course published' : 'Course hidden from students');
  } catch (error) { showToast(error.message, 'error'); }
}

/* Copying is how last year's course is run again. The copy arrives unpublished
   and enrolled in nothing, and we open it, because the next thing anybody wants
   is to change the dates in it. */
async function duplicateCourse(course) {
  try {
    const copy = await api(`/api/admin/courses/${course.id}/duplicate`, { method: 'POST', body: {} });
    await loadCourses();
    await openCourse(copy.id);
    showToast('Copied. The copy is a draft until you publish it.');
  } catch (error) { showToast(error.message, 'error'); }
}

async function confirmDeleteCourse(course) {
  let impact;
  try { impact = await api(`/api/admin/courses/${course.id}/impact`); }
  catch (error) { return showToast(error.message, 'error'); }
  const ok = await askConfirm({
    title: `Delete “${course.title}”?`,
    message: `${impact.lessons} lesson${impact.lessons === 1 ? '' : 's'} and ${impact.progress} record${impact.progress === 1 ? '' : 's'} of students having watched them go with it. This cannot be undone — to put a finished course away without losing it, unpublish it instead.`,
    confirmLabel: 'Delete course', danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/admin/courses/${course.id}`, { method: 'DELETE' });
    // Back to the list: the thing that was being looked at is gone.
    state.course = null;
    state.lessonId = null;
    await loadCourses();
    renderCourseView();
    showToast('Course deleted');
  } catch (error) { showToast(error.message, 'error'); }
}

/** Reload the list, and the open course too if it is the one that changed. */
async function refreshCourses(courseId = null) {
  await loadCourses();
  if (state.course && (!courseId || state.course.id === courseId)) await openCourse(state.course.id, state.lessonId);
  else renderCourseView();
}

function openCourseModal(course = null) {
  const classes = state.classes || [];
  modal({
    title: course ? 'Course settings' : 'New course',
    subtitle: 'A course holds sections, and a section holds the class recordings.',
    body: `<form id="course-form">
      <div class="form-field"><label>Title</label><input name="title" required value="${escapeHtml(course?.title || '')}" placeholder="Irish for Primary Teaching"></div>
      <div class="form-field"><label>Description</label><textarea name="description" rows="3">${escapeHtml(course?.description || '')}</textarea></div>
      <div class="form-field"><label>Cover photo</label>
        ${coverField(course?.cover_url || '')}
      </div>
      <div class="form-field"><label>Who sees it</label>
        <label class="check-row"><input type="checkbox" name="openToAll" id="course-open-all" ${course?.open_to_all ? 'checked' : ''}> Every class, including ones added later</label>
        <div class="class-picker ${course?.open_to_all ? 'is-off' : ''}" id="course-classes">
          ${classes.length
            ? classes.map((row) => `<label class="check-row"><input type="checkbox" name="classIds" value="${row.id}" ${(course?.classes || []).some((c) => c.id === row.id) ? 'checked' : ''}> ${escapeHtml(classLabel(row))}</label>`).join('')
            : '<p class="muted small">No classes yet.</p>'}
        </div>
      </div>
      <label class="check-row"><input type="checkbox" name="published" ${course?.published ? 'checked' : ''}> Visible to students</label>
    </form>`,
    footer: `<button class="btn" data-close-modal>Cancel</button>${course ? `<button class="btn danger" id="delete-course">Delete</button>` : ''}<button class="btn primary" id="save-course">${course ? 'Save' : 'Create course'}</button>`,
    onOpen() {
      // Picking classes is meaningless while the course is open to everybody.
      const openAll = document.getElementById('course-open-all');
      const picker = document.getElementById('course-classes');
      openAll?.addEventListener('change', () => picker.classList.toggle('is-off', openAll.checked));
      bindCoverField();
      document.getElementById('save-course').addEventListener('click', async () => {
        const form = document.getElementById('course-form');
        const data = new FormData(form);
        const body = {
          title: String(data.get('title') || '').trim(),
          description: String(data.get('description') || '').trim(),
          openToAll: form.openToAll.checked,
          classIds: form.openToAll.checked ? [] : data.getAll('classIds'),
          coverUrl: String(data.get('coverUrl') || '').trim() || null,
          published: form.published.checked,
        };
        if (!body.title) return showToast('Give the course a title.', 'error');
        try {
          if (course) await api(`/api/admin/courses/${course.id}`, { method: 'PATCH', body });
          else await api('/api/admin/courses', { method: 'POST', body });
          closeModal();
          await loadCourses();
          if (course) await openCourse(course.id, state.lessonId); else renderCourseView();
          showToast(course ? 'Course saved' : 'Course created');
        } catch (error) { showToast(error.message, 'error'); }
      });
      document.getElementById('delete-course')?.addEventListener('click', async () => {
        let impact;
        try { impact = await api(`/api/admin/courses/${course.id}/impact`); }
        catch (error) { return showToast(error.message, 'error'); }
        const ok = await askConfirm({
          title: `Delete “${course.title}”?`,
          message: `${impact.lessons} lesson${impact.lessons === 1 ? '' : 's'} and ${impact.progress} record${impact.progress === 1 ? '' : 's'} of students having watched them go with it. This cannot be undone.`,
          confirmLabel: 'Delete course', danger: true,
        });
        if (!ok) return;
        try {
          await api(`/api/admin/courses/${course.id}`, { method: 'DELETE' });
          closeModal();
          state.course = null;
          await loadCourses();
          renderCourseView();
          showToast('Course deleted');
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

/* ---- Importing from Zoom ----------------------------------------- */

/* Every recording on the Zoom account, and nothing acts on any of them without
   being told to. A Zoom account holds one-to-ones, test calls and meetings that
   have no business on a class portal, so the list is a list and the Import
   button is the decision. */
async function openZoomImport() {
  let status;
  try { status = await api('/api/admin/zoom/status'); }
  catch (error) { return showToast(error.message, 'error'); }

  if (!status.zoom || !status.bunny) {
    return modal({
      title: 'Import from Zoom',
      subtitle: 'Not connected yet.',
      body: `<div class="zi-setup">
        <p>Two things are needed before recordings can come across, and neither is in the interface — both are keys that belong in the environment file:</p>
        <ol>
          <li><strong>A Zoom Server-to-Server OAuth app</strong> ${status.zoom ? '<b class="zi-ok">connected</b>' : '<b class="zi-no">not set</b>'}<br>
            <span class="muted small">Create one at marketplace.zoom.us, give it the recording read scopes, and put the account id, client id and secret in <code>ZOOM_ACCOUNT_ID</code>, <code>ZOOM_CLIENT_ID</code> and <code>ZOOM_CLIENT_SECRET</code>. It is never given permission to delete anything.</span></li>
          <li><strong>A Bunny Stream library</strong> ${status.bunny ? '<b class="zi-ok">connected</b>' : '<b class="zi-no">not set</b>'}<br>
            <span class="muted small">Put the library id and API key in <code>BUNNY_LIBRARY_ID</code> and <code>BUNNY_API_KEY</code>. Add <code>BUNNY_TOKEN_KEY</code> as well and playback links are signed, so a forwarded link stops working.</span></li>
        </ol>
        <p class="muted small">The README has the full walkthrough under <em>Importing from Zoom</em>.</p>
      </div>`,
      footer: '<button class="btn primary" data-close-modal>Close</button>',
    });
  }

  modal({
    title: 'Import from Zoom',
    subtitle: status.signedPlayback
      ? 'Playback links are signed, so a forwarded link will not work.'
      : 'Playback is unsigned — add BUNNY_TOKEN_KEY to lock links to your students.',
    wide: true,
    body: '<div id="zi-body"><p class="muted small">Asking Zoom what is there…</p></div>',
    footer: '<button class="btn" data-close-modal>Close</button><button class="btn" id="zi-sweep">Run automatic import</button>',
    onOpen() {
      document.getElementById('zi-sweep').addEventListener('click', async () => {
        try {
          const result = await api('/api/admin/zoom/sweep', { method: 'POST' });
          showToast(result.imported ? `Imported ${result.imported}` : (result.reason || 'Nothing to import'));
          renderZoomList();
        } catch (error) { showToast(error.message, 'error'); }
      });
      renderZoomList();
    },
  });
}

async function renderZoomList() {
  const holder = document.getElementById('zi-body');
  if (!holder) return;
  let data;
  try { data = await api('/api/admin/zoom/recordings?months=3'); }
  catch (error) { holder.innerHTML = `<p class="muted small">${escapeHtml(error.message)}</p>`; return; }

  // Every section of every course, so a recording can be dropped straight in.
  const sections = [];
  for (const course of state.courses || []) {
    const detail = await api(`/api/admin/courses/${course.id}`).catch(() => null);
    for (const module of detail?.modules || []) sections.push({ id: module.id, label: `${course.title} · ${module.title}` });
  }

  const picker = (id, selected) => `<select class="select compact" data-zi-module="${id}">
    <option value="">Choose a section…</option>
    ${sections.map((section) => `<option value="${section.id}" ${section.id === selected ? 'selected' : ''}>${escapeHtml(section.label)}</option>`).join('')}
  </select>`;

  holder.innerHTML = `
    ${data.recordings.length ? `<div class="zi-list">${data.recordings.map((recording) => {
      const done = recording.importStatus === 'done';
      return `<article class="zi-row ${done ? 'is-done' : ''}">
        <div class="zi-copy">
          <strong>${escapeHtml(recording.topic || 'Untitled meeting')}</strong>
          <span>${escapeHtml(fmtDate(recording.startedAt, { dateStyle: 'medium', time: true }))} · ${Math.round((recording.durationSeconds || 0) / 60)} min · ${(recording.fileSize / 1024 / 1024).toFixed(0)}MB
            ${recording.autoImport ? ' · <b>imports automatically</b>' : ''}</span>
          ${recording.error ? `<span class="zi-err">${escapeHtml(recording.error)}</span>` : ''}
        </div>
        ${done
          ? '<span class="zi-badge">Imported</span>'
          : `${picker(recording.fileId, recording.targetModuleId)}
             <button class="btn small primary" data-zi-import="${recording.fileId}" data-uuid="${escapeHtml(recording.uuid)}">Import</button>`}
      </article>`;
    }).join('')}</div>` : '<p class="muted small">No recordings on the account in the last three months.</p>'}

    <div class="section-title">Import automatically</div>
    <p class="muted small">A recurring webinar keeps the same id every week. Name one here and its recordings come across on their own — everything else stays in the list above until you say so.</p>
    ${data.sources.length ? `<div class="zi-rules">${data.sources.map((source) => `<div class="zi-rule">
      <strong>${escapeHtml(source.label || source.zoom_id)}</strong>
      <span class="muted small">${escapeHtml(source.zoom_id)}${source.module_title ? ` → ${escapeHtml(source.course_title)} · ${escapeHtml(source.module_title)}` : ' → no section chosen'}</span>
      <span class="pill ${source.auto_import ? 'green' : ''}">${source.auto_import ? 'Automatic' : 'Manual only'}</span>
      <button class="btn small danger" data-zi-forget="${source.id}">Remove</button>
    </div>`).join('')}</div>` : ''}
    <form id="zi-rule-form" class="zi-newrule">
      <input name="zoomId" placeholder="Webinar or meeting id" required>
      <input name="label" placeholder="What it is, e.g. Monday class">
      ${picker('new', '')}
      <label class="check-row"><input type="checkbox" name="autoImport"> Bring new recordings across on their own</label>
      <button type="button" class="btn small" id="zi-save-rule">Save</button>
    </form>`;

  holder.querySelectorAll('[data-zi-import]').forEach((button) => button.addEventListener('click', async () => {
    const moduleId = holder.querySelector(`[data-zi-module="${button.dataset.ziImport}"]`)?.value;
    if (!moduleId) return showToast('Choose the section it belongs in first.', 'error');
    button.disabled = true;
    button.textContent = 'Importing…';
    try {
      await api('/api/admin/zoom/import', {
        method: 'POST',
        body: { uuid: button.dataset.uuid, fileId: button.dataset.ziImport, moduleId },
      });
      showToast('Imported as a draft lesson — check the title before publishing it');
      renderZoomList();
    } catch (error) {
      showToast(error.message, 'error');
      button.disabled = false;
      button.textContent = 'Import';
    }
  }));

  holder.querySelector('#zi-save-rule')?.addEventListener('click', async () => {
    const form = document.getElementById('zi-rule-form');
    const data2 = new FormData(form);
    const body = {
      zoomId: String(data2.get('zoomId') || '').trim(),
      label: String(data2.get('label') || '').trim(),
      moduleId: holder.querySelector('[data-zi-module="new"]')?.value || null,
      autoImport: form.autoImport.checked,
    };
    if (!body.zoomId) return showToast('Give the webinar id.', 'error');
    try {
      await api('/api/admin/zoom/sources', { method: 'PUT', body });
      showToast('Saved');
      renderZoomList();
    } catch (error) { showToast(error.message, 'error'); }
  });

  holder.querySelectorAll('[data-zi-forget]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/api/admin/zoom/sources/${button.dataset.ziForget}`, { method: 'DELETE' });
      renderZoomList();
    } catch (error) { showToast(error.message, 'error'); }
  }));
}

/* Adding a recording. The host is chosen and the link pasted; whole URLs and
   bare ids both work, because nobody should have to know which one their host
   wants. */
function openLessonModal(moduleId, lesson = null) {
  const providers = [
    ['bunny', 'Bunny Stream'],
    ['youtube', 'YouTube'],
    ['loom', 'Loom'],
    ['mp4', 'A file on this server'],
  ];
  const minutes = lesson?.durationSeconds ? Math.round(lesson.durationSeconds / 60) : '';
  modal({
    title: lesson ? 'Edit lesson' : 'New lesson',
    wide: true,
    body: `<form id="lesson-form">
      <div class="form-field"><label>Title</label><input name="title" required value="${escapeHtml(lesson?.title || '')}" placeholder="Week 1: An aimsir chaite"></div>
      <div class="form-row">
        <div class="form-field"><label>Recording host</label>
          <select name="videoProvider">
            <option value="">No recording yet</option>
            ${providers.map(([value, label]) => `<option value="${value}" ${lesson?.videoProvider === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="form-field"><label>Length in minutes</label><input name="minutes" type="number" min="0" value="${minutes}"></div>
        <div class="form-field"><label>Recorded on</label><input name="recordedOn" type="date" value="${lesson?.recordedOn ? String(lesson.recordedOn).slice(0, 10) : ''}"></div>
      </div>
      <div class="form-field"><label>Link or id</label>
        <input name="video" value="${escapeHtml(lesson?.videoRef || '')}" placeholder="Paste the share link">
        <p class="muted small">A whole link or a bare id, whichever you have. Zoom recording links will not work — Zoom blocks playback outside its own pages, so the file has to be uploaded to one of the hosts above.</p>
      </div>
      <div class="form-field"><label>Notes</label><textarea name="notes" rows="5" placeholder="What this class covered, and anything to do before the next one.">${escapeHtml(lesson?.notes || '')}</textarea></div>
      <label class="check-row"><input type="checkbox" name="published" ${lesson === null || lesson.published ? 'checked' : ''}> Visible to students</label>
    </form>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="save-lesson">${lesson ? 'Save lesson' : 'Add lesson'}</button>`,
    onOpen() {
      document.getElementById('save-lesson').addEventListener('click', async () => {
        const form = document.getElementById('lesson-form');
        const data = new FormData(form);
        const body = {
          title: String(data.get('title') || '').trim(),
          notes: String(data.get('notes') || '').trim(),
          videoProvider: data.get('videoProvider') || null,
          video: String(data.get('video') || '').trim() || null,
          durationSeconds: data.get('minutes') ? Number(data.get('minutes')) * 60 : null,
          recordedOn: data.get('recordedOn') || null,
          published: form.published.checked,
        };
        if (!body.title) return showToast('Give the lesson a title.', 'error');
        try {
          if (lesson) await api(`/api/admin/lessons/${lesson.id}`, { method: 'PATCH', body });
          else await api(`/api/admin/modules/${moduleId}/lessons`, { method: 'POST', body });
          closeModal();
          await openCourse(state.course.id, lesson ? state.lessonId : null);
          showToast(lesson ? 'Lesson saved' : 'Lesson added');
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

/* ------------------------------------------------------------------
   The class feed.

   One implementation serves both sides. The administrator gets moderation,
   scheduling and file attachments; everything else — the composer, categories,
   likes, comments, GIFs — is identical, because a teacher posting to their own
   class is doing the same thing a student is.
   ------------------------------------------------------------------ */

const AVATAR_COLOURS = ['#3f922c', '#1570ef', '#dc6803', '#6938ef', '#e04f16', '#0086c9', '#ba24d5'];

/* Must match REACTIONS in src/community.js — the server rejects anything else. */
const REACTIONS = ['👍', '❤️', '🎉', '😂', '😮', '🙏', '💪', '🤔'];

/* The reactions already on something, plus the button that adds another. A
   reaction nobody has used yet is not shown: a row of eight grey zeroes reads as
   a chore, and the same row with two live counts on it reads as a room. */
function reactionRow(type, id, reactions = [], size = '') {
  const chips = (reactions || []).map((row) => `
    <button class="rx ${row.mine ? 'on' : ''} ${size}" data-react="${type}" data-id="${id}" data-emoji="${row.emoji}"
      aria-pressed="${Boolean(row.mine)}" title="${row.count} ${row.count === 1 ? 'person' : 'people'}">
      <span>${row.emoji}</span><b>${row.count}</b>
    </button>`).join('');
  return `<span class="rx-row" data-rx-for="${type}:${id}">
    ${chips}
    <button class="rx add ${size}" data-react-open="${type}" data-id="${id}" aria-label="Add a reaction">${svg.smile}</button>
  </span>`;
}

/* Redraws one reaction row in place. Re-rendering the feed would lose the
   reader's scroll position for the sake of a single count. */
function applyReactions(type, id, reactions) {
  document.querySelectorAll(`[data-rx-for="${type}:${id}"]`).forEach((row) => {
    row.outerHTML = reactionRow(type, id, reactions, row.classList.contains('sm') ? 'sm' : '');
  });
  bindReactions(document);
  if (modalRoot) bindReactions(modalRoot);
}

/* Somebody with a photograph gets their photograph. Somebody without gets
   initials on a colour derived from their name, so the same person is the same
   colour on every screen and every load. */
function boardAvatar(author, size = '') {
  const name = String(author?.name || '?');
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  const colour = AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
  const fallback = `<span class="fa ${size} is-initials" style="background:${colour}">${escapeHtml(initials(name))}</span>`;
  if (!author?.id || !author?.avatar) return fallback;
  /* A picture that will not load — a file removed underneath us, or a preview
     with no server behind it — falls back to initials rather than leaving the
     broken-image glyph sitting in the middle of the feed. */
  return `<img class="fa ${size}" src="/api/media/avatar/${author.id}" alt="${escapeHtml(name)}" loading="lazy"
    onerror="this.outerHTML=this.dataset.fallback" data-fallback="${escapeHtml(fallback)}">`;
}

const me = () => ({ id: state.user?.id, name: state.user?.name, avatar: state.user?.hasAvatar });

/* "3h" reads faster than a date when the point of the line is how recent
   something is. Past a week the date comes back, because "63d" is not a unit
   anybody thinks in. */
function timeAgo(value) {
  if (!value) return '';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return fmtDate(value, { dateStyle: 'medium' });
}

/* When something is due to appear. Read by the teacher only. */
function scheduledFor(value) {
  const at = new Date(value).getTime();
  const minutes = Math.round((at - Date.now()) / 60000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
  if (minutes < 60 * 24) return `in ${Math.round(minutes / 60)}h`;
  return fmtDate(value, { weekday: true, time: true, dateStyle: 'short' });
}

const boardApi = () => (state.user.role === 'admin' ? '/api/admin' : '/api/student');
const isAdmin = () => state.user.role === 'admin';

/* Mirrors src/videolinks.js. Anything not recognisably one of these two is
   refused rather than dropped into an iframe. */
const VIDEO_PATTERNS = [
  ['loom', /loom\.com\/(?:share|embed)\/([a-zA-Z0-9]{8,})/i],
  ['youtube', /youtube\.com\/watch\?(?:[^\s]*&)?v=([a-zA-Z0-9_-]{6,})/i],
  ['youtube', /youtu\.be\/([a-zA-Z0-9_-]{6,})/i],
  ['youtube', /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i],
  ['youtube', /youtube\.com\/live\/([a-zA-Z0-9_-]{6,})/i],
];

function videoEmbed(url) {
  for (const [kind, pattern] of VIDEO_PATTERNS) {
    const match = String(url || '').match(pattern);
    if (!match) continue;
    return {
      kind,
      src: kind === 'loom'
        ? `https://www.loom.com/embed/${match[1]}`
        : `https://www.youtube-nocookie.com/embed/${match[1]}`,
    };
  }
  return null;
}

async function reloadBoard() {
  const params = new URLSearchParams();
  if (state.boardSort === 'hot') params.set('sort', 'hot');
  if (state.boardCategoryId) params.set('categoryId', state.boardCategoryId);
  const suffix = params.toString() ? `?${params}` : '';
  try {
    state.community = isAdmin()
      ? await api(`/api/admin/community/${state.communityClassId}${suffix}`)
      : await api(`/api/student/community${suffix}`);
  } catch (error) { return showToast(error.message, 'error'); }
  if (isAdmin()) {
    shell({ nav: adminNav(), content: communityView(), title: 'Community', roleLabel: 'Administrator' });
    bindAdminView();
  } else renderStudent();
}

/* ------------------------------------------------------------------
   Composing
   ------------------------------------------------------------------ */

/* Attachments being staged for the post currently being written. Held here
   rather than in the form because a GIF is chosen in a second dialog, and the
   half-written post underneath has to survive that. */
let draftAttachments = [];

/* What the composer had in it when it was interrupted. Choosing a GIF opens a
   second dialog over the first, and a dialog that throws away a half-written
   post is worse than no GIF picker at all. */
let composerDraft = null;

function captureComposer() {
  const form = document.getElementById('thread-form');
  if (!form) return;
  composerDraft = {
    title: form.title.value,
    body: form.body.value,
    categoryId: form.categoryId?.value || null,
    when: document.getElementById('composer-when')?.value || '',
    pinned: Boolean(form.pinned?.checked),
  };
}

const MAX_ATTACHMENT_MB = 40;

/** "2.4 MB", the way a file manager writes it. */
function fileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentFormat(item) {
  if (item.kind === 'gif') return 'GIF';
  if (item.kind === 'loom') return 'LOOM';
  if (item.kind === 'youtube') return 'VIDEO';
  return /\.docx$/i.test(item.fileName || '') || String(item.mimeType || '').includes('wordprocessingml')
    ? 'DOCX' : 'PDF';
}

/* One row per attachment: the format as a badge, the name, the size, and either
   a progress bar while it is going up or a tick once it is there. Modelled on
   the Untitled UI file uploader, which is the same design language the rest of
   this interface already uses. */
function attachmentRow(item, index) {
  const format = attachmentFormat(item);
  const failed = Boolean(item.error);
  const uploading = !failed && item.progress != null && item.progress < 100;
  return `<div class="fu-row ${failed ? 'is-failed' : ''}" data-attachment="${index}">
    <span class="fu-badge fu-${format.toLowerCase()}">
      ${item.kind === 'gif' ? `<img src="${escapeHtml(item.preview || item.url)}" alt="">` : `<i>${format}</i>`}
    </span>
    <div class="fu-copy">
      <strong>${escapeHtml(item.fileName || (item.kind === 'gif' ? 'GIF' : format))}</strong>
      <span>${failed ? escapeHtml(item.error) : item.sizeBytes ? fileSize(item.sizeBytes) : format}</span>
      ${uploading ? `<div class="fu-bar"><span style="width:${item.progress}%"></span></div>` : ''}
    </div>
    ${uploading
      ? `<span class="fu-pct">${item.progress}%</span>`
      : failed
        ? ''
        : `<span class="fu-done">${svg.tick}</span>`}
    <button type="button" class="fu-x" data-drop-attachment="${index}" aria-label="Remove ${escapeHtml(item.fileName || 'attachment')}">${svg.trash}</button>
  </div>`;
}

function renderDraftAttachments() {
  const holder = document.getElementById('draft-attachments');
  if (!holder) return;
  holder.innerHTML = draftAttachments.map(attachmentRow).join('');
  holder.classList.toggle('hidden', !draftAttachments.length);
  holder.querySelectorAll('[data-drop-attachment]').forEach((button) => button.addEventListener('click', () => {
    draftAttachments.splice(Number(button.dataset.dropAttachment), 1);
    renderDraftAttachments();
  }));
}

/* XHR rather than fetch, because fetch cannot report upload progress and a
   40MB scan over a slow connection with no feedback looks like a hung page. */
function uploadDocument(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const request = new XMLHttpRequest();
    request.open('POST', '/api/admin/community/attachments');
    request.withCredentials = true;
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      let payload = {};
      try { payload = JSON.parse(request.responseText); } catch { /* handled below */ }
      if (request.status >= 200 && request.status < 300) resolve(payload);
      else reject(new Error(payload.error || 'That file could not be uploaded.'));
    });
    request.addEventListener('error', () => reject(new Error('That file could not be uploaded.')));
    request.send(form);
  });
}

/* Checked here as well as on the server so somebody does not watch a 60MB file
   upload for a minute only to be told at the end. */
async function acceptDocuments(files) {
  for (const file of [...files]) {
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      draftAttachments.push({ kind: 'file', fileName: file.name, sizeBytes: file.size,
        error: `Too large — the limit is ${MAX_ATTACHMENT_MB}MB.` });
      renderDraftAttachments();
      continue;
    }
    const row = { kind: 'file', fileName: file.name, sizeBytes: file.size, progress: 0 };
    draftAttachments.push(row);
    renderDraftAttachments();
    try {
      const uploaded = await uploadDocument(file, (percent) => {
        row.progress = percent;
        renderDraftAttachments();
      });
      Object.assign(row, uploaded, { progress: 100 });
    } catch (error) {
      row.error = error.message;
      delete row.progress;
    }
    renderDraftAttachments();
  }
}


/* Emoji, for anybody writing anything.
   ------------------------------------------------------------------
   The board already had reactions, but those are a fixed set of eight and they
   sit on a post rather than in it. This is for writing: a student answering a
   comment wants a 😅 in the sentence, not stuck to the end of somebody else's.

   No library and no image set — these are characters, and every device the
   portal runs on already draws them. Grouped the way people look for them
   rather than by Unicode block, and searchable by the words somebody would
   actually type. */
const EMOJI_GROUPS = [
  {
    name: 'Smileys',
    items: [
      ['😀', 'grin happy smile'], ['😄', 'happy smile laugh'], ['😅', 'sweat relief phew nervous'],
      ['😂', 'laugh crying funny'], ['🙂', 'smile slight'], ['😉', 'wink'],
      ['😊', 'blush happy warm'], ['🥰', 'love hearts adore'], ['😍', 'love heart eyes'],
      ['🤔', 'thinking wonder hmm'], ['😬', 'grimace awkward yikes'], ['😴', 'sleep tired'],
      ['😭', 'crying sob'], ['😱', 'shock scream'], ['🥳', 'party celebrate'],
      ['😇', 'angel innocent'], ['🙃', 'upside down'], ['😌', 'relieved calm'],
    ],
  },
  {
    name: 'Gestures',
    items: [
      ['👍', 'thumbs up yes good'], ['👏', 'clap well done applause'], ['🙏', 'thanks please pray'],
      ['💪', 'strong muscle effort'], ['🤝', 'handshake agree'], ['👋', 'wave hello hi'],
      ['✌️', 'peace victory'], ['🤞', 'fingers crossed luck'], ['👌', 'ok perfect'],
      ['🫶', 'heart hands love'],
    ],
  },
  {
    name: 'Hearts and marks',
    items: [
      ['❤️', 'heart love red'], ['💚', 'green heart'], ['✨', 'sparkles nice'],
      ['🎉', 'party celebrate congratulations'], ['⭐', 'star'], ['🔥', 'fire great'],
      ['✅', 'tick done correct'], ['❌', 'cross wrong no'], ['❓', 'question'],
      ['❗', 'exclamation important'],
    ],
  },
  {
    name: 'Course',
    items: [
      ['📚', 'books study reading'], ['✏️', 'pencil write homework'], ['📝', 'note writing exam'],
      ['🎧', 'headphones listening audio'], ['🗣️', 'speaking oral talk'], ['📖', 'book reading'],
      ['🍀', 'clover luck irish'], ['☘️', 'shamrock irish ireland'], ['🇮🇪', 'ireland flag irish'],
      ['⏰', 'clock time deadline'], ['📅', 'calendar date'], ['🎓', 'graduate exam course'],
    ],
  },
];

/* The most recently used, kept on this device. A picker that always opens on the
   same grid makes somebody hunt for the four they actually use. */
function recentEmoji() {
  try { return JSON.parse(localStorage.getItem('gg-recent-emoji') || '[]').slice(0, 12); }
  catch { return []; }
}

function rememberEmoji(emoji) {
  try {
    const next = [emoji, ...recentEmoji().filter((item) => item !== emoji)].slice(0, 12);
    localStorage.setItem('gg-recent-emoji', JSON.stringify(next));
  } catch { /* private browsing; the picker still works, it just forgets. */ }
}

/**
 * Attach a picker to a text box.
 *
 * The emoji goes in at the cursor rather than at the end, because somebody
 * adding one to a sentence they have already written is the normal case.
 */
function emojiButton(targetId) {
  return `<button type="button" class="emoji-btn" data-emoji-for="${targetId}"
    aria-label="Add an emoji" title="Add an emoji">${svg.smiley}</button>`;
}

function bindEmojiButtons(root = document) {
  root.querySelectorAll('[data-emoji-for]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEmojiPicker(button, button.dataset.emojiFor);
    });
  });
}

function openEmojiPicker(anchorElement, targetId) {
  document.querySelectorAll('.emoji-pop').forEach((open) => open.remove());
  const recent = recentEmoji();

  const grid = (items) => `<div class="emoji-grid">${items.map(([emoji, words]) =>
    `<button type="button" class="emoji-pick" data-emoji="${emoji}" data-words="${escapeHtml(words || '')}"
      title="${escapeHtml((words || '').split(' ')[0])}">${emoji}</button>`).join('')}</div>`;

  const pop = document.createElement('div');
  pop.className = 'emoji-pop';
  pop.innerHTML = `
    <div class="emoji-search"><input type="search" placeholder="Search" aria-label="Search emoji"></div>
    <div class="emoji-scroll">
      ${recent.length ? `<h5>Recent</h5>${grid(recent.map((emoji) => [emoji, '']))}` : ''}
      ${EMOJI_GROUPS.map((group) => `<h5>${escapeHtml(group.name)}</h5>${grid(group.items)}`).join('')}
    </div>
    <p class="emoji-none hidden">Nothing matching that.</p>`;
  document.body.append(pop);

  // Against the button, nudged back on screen if it would hang off an edge.
  const box = anchorElement.getBoundingClientRect();
  const width = pop.offsetWidth;
  const height = pop.offsetHeight;
  pop.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - width - 12))}px`;
  pop.style.top = box.top - height - 8 > 8 ? `${box.top - height - 8}px` : `${box.bottom + 8}px`;

  const search = pop.querySelector('input');
  const none = pop.querySelector('.emoji-none');
  search.addEventListener('input', () => {
    const term = search.value.trim().toLowerCase();
    let showing = 0;
    pop.querySelectorAll('.emoji-pick').forEach((pick) => {
      const hit = !term || (pick.dataset.words || '').includes(term);
      pick.classList.toggle('hidden', !hit);
      if (hit) showing += 1;
    });
    // A heading with nothing under it reads as a bug.
    pop.querySelectorAll('.emoji-grid').forEach((section) => {
      const empty = !section.querySelector('.emoji-pick:not(.hidden)');
      section.classList.toggle('hidden', empty);
      section.previousElementSibling?.classList.toggle('hidden', empty);
    });
    none.classList.toggle('hidden', showing > 0);
  });

  pop.querySelectorAll('.emoji-pick').forEach((pick) => pick.addEventListener('click', () => {
    insertEmoji(targetId, pick.dataset.emoji);
    rememberEmoji(pick.dataset.emoji);
    pop.remove();
  }));

  const close = (event) => {
    if (pop.contains(event.target) || anchorElement.contains(event.target)) return;
    pop.remove();
    document.removeEventListener('click', close);
  };
  setTimeout(() => document.addEventListener('click', close), 0);
  document.addEventListener('keydown', function escape(event) {
    if (event.key !== 'Escape') return;
    pop.remove();
    document.removeEventListener('keydown', escape);
  });
  search.focus();
}

/* At the cursor, not at the end — somebody adding one to a sentence they have
   already written is the normal case, and the cursor is left after it so they
   can keep typing. */
function insertEmoji(targetId, emoji) {
  const field = document.getElementById(targetId);
  if (!field) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = field.value.slice(0, start) + emoji + field.value.slice(end);
  const at = start + emoji.length;
  field.setSelectionRange(at, at);
  field.focus();
  // Anything watching the field — the video preview, a draft capture — should
  // see this the same way it sees typing.
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/* Where the post is going.
   ------------------------------------------------------------------
   This was a menu, and before that a native select. Both hid the choice behind
   a click, and something hidden behind a click gets whatever it was already
   showing — which is how everything ends up in General.

   The categories are laid out as the same chips the board itself filters by, so
   picking one is a decision somebody makes rather than a default they accept,
   and the thing they are choosing looks like the thing they will see it under
   afterwards.

   Nothing is preselected, and posting without one is refused. That is the point:
   a required choice with a default is not a choice. */
function categoryPicker(categories, selectedId) {
  return `<div class="cw-cats" id="cat-picker">
    <input type="hidden" name="categoryId" id="cat-value" value="${escapeHtml(selectedId || '')}">
    <span class="cw-cats-label">Post in</span>
    <span class="cw-cats-row" role="radiogroup" aria-label="Choose a category">
      ${categories.map((row) => `<button type="button" class="cat ${row.id === selectedId ? 'on' : ''}"
        role="radio" aria-checked="${row.id === selectedId}" data-cat="${row.id}">${escapeHtml(row.name)}</button>`).join('')}
    </span>
  </div>`;
}

function bindCategoryPicker() {
  const picker = document.getElementById('cat-picker');
  if (!picker) return;
  picker.querySelectorAll('[data-cat]').forEach((chip) => chip.addEventListener('click', () => {
    document.getElementById('cat-value').value = chip.dataset.cat;
    picker.querySelectorAll('[data-cat]').forEach((other) => {
      other.classList.toggle('on', other === chip);
      other.setAttribute('aria-checked', String(other === chip));
    });
    // Clears the "pick one" state the moment one is picked.
    picker.classList.remove('is-missing');
  }));
}

/** Nothing chosen is a reason not to post, and the reason is shown where the choice is. */
function categoryChosen() {
  const picker = document.getElementById('cat-picker');
  // A board with no categories at all cannot require one.
  if (!picker || !picker.querySelector('[data-cat]')) return true;
  if (document.getElementById('cat-value')?.value) return true;
  picker.classList.add('is-missing');
  picker.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return false;
}


function openComposer({ restore = false } = {}) {
  const categories = state.community?.categories || [];
  const admin = isAdmin();
  const draft = restore ? composerDraft : null;
  if (!restore) { draftAttachments = []; composerDraft = null; }
  const tool = (id, icon, label) => `<button type="button" class="tool" id="${id}" title="${label}" aria-label="${label}">${icon}</button>`;
  modal({
    title: '',
    wide: true,
    bare: true,
    body: `<form id="thread-form" class="composer-form">
      <header class="cw-head">
        ${boardAvatar(me(), 'sm')}
        <div class="cw-who">
          <strong>${escapeHtml(state.user.name)}</strong>
        </div>
        <button type="button" class="cw-x" data-close-modal aria-label="Close">${svg.x}</button>
      </header>

      ${/* Nothing preselected. The board's current filter is where somebody was
           reading, not where they mean to post, and carrying it over would make
           this a default wearing the clothes of a choice. Only a restored draft
           brings a category back with it. */
        categories.length ? categoryPicker(categories, draft?.categoryId || '') : ''}

      <input name="title" id="composer-title" placeholder="Title" autocomplete="off" required value="${escapeHtml(draft?.title || '')}">
      <textarea id="composer-body" name="body" rows="6" placeholder="Write something… paste a YouTube or Loom link and it will play here" required>${escapeHtml(draft?.body || '')}</textarea>
      <div id="video-preview" class="hidden"></div>
      ${admin ? `<label class="fu-zone hidden" id="fu-zone">
        <input type="file" id="pdf-input" multiple class="fu-input"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
        <span class="fu-icon">${svg.cloudUp}</span>
        <span class="fu-lead"><b>Click to upload</b> or drag and drop</span>
        <span class="fu-hint">PDF or Word document, up to ${MAX_ATTACHMENT_MB}MB</span>
      </label>` : ''}
      <div id="draft-attachments" class="fu-list hidden"></div>

      ${admin ? `<div class="schedule-row hidden" id="schedule-row">
        <label for="composer-when">Appears to students at</label>
        <input type="datetime-local" id="composer-when" value="${escapeHtml(draft?.when || '')}">
        <button type="button" class="cw-x small" id="schedule-clear" aria-label="Do not schedule">${svg.x}</button>
        <p class="muted small">Times in ${escapeHtml(classTimezone())}. Until then it sits in your feed marked Scheduled, and nobody is notified.</p>
      </div>` : ''}

      <footer class="cw-foot">
        <div class="composer-tools">
          <button type="button" class="tool" data-emoji-for="composer-body" aria-label="Add an emoji">${svg.smiley}</button>
          ${admin ? tool('attach-file', svg.paperclip || svg.cloudUp, 'Attach a file') : ''}
          ${admin ? tool('attach-dictate', svg.mic, 'Dictate') : ''}
          ${admin ? tool('attach-schedule', svg.calendar, 'Schedule for later') : ''}
        </div>
        <div class="cw-actions">
          ${admin ? `<label class="cw-pin"><input type="checkbox" name="pinned" ${draft?.pinned ? 'checked' : ''}> Pin to the top</label>` : ''}
          <button type="button" class="btn" data-close-modal>Cancel</button>
          <button type="button" class="btn primary" id="save-thread">Post</button>
        </div>
      </footer>
      <div id="dictate-slot" class="hidden">${dictateButton('composer-body')}</div>
    </form>`,
    onOpen() {
      bindDictation();
      bindEmojiButtons(modalRoot);
      bindCategoryPicker();
      renderDraftAttachments();
      if (!draft) document.getElementById('composer-title')?.focus();

      /* The upload zone and the schedule row are folded away until asked for.
         An empty drop target and an empty date field took up half the dialog
         before there was anything in either of them. */
      const zone = document.getElementById('fu-zone');
      const scheduleRow = document.getElementById('schedule-row');
      const reveal = (element, toolId) => {
        element?.classList.remove('hidden');
        document.getElementById(toolId)?.classList.add('is-on');
      };
      if (draft?.when) reveal(scheduleRow, 'attach-schedule');
      document.getElementById('attach-file')?.addEventListener('click', () => {
        if (zone?.classList.contains('hidden')) { reveal(zone, 'attach-file'); document.getElementById('pdf-input')?.click(); }
        else { zone?.classList.add('hidden'); document.getElementById('attach-file')?.classList.remove('is-on'); }
      });
      document.getElementById('attach-schedule')?.addEventListener('click', () => {
        if (scheduleRow?.classList.contains('hidden')) reveal(scheduleRow, 'attach-schedule');
        else { scheduleRow?.classList.add('hidden'); document.getElementById('attach-schedule')?.classList.remove('is-on'); }
      });
      document.getElementById('schedule-clear')?.addEventListener('click', () => {
        const when = document.getElementById('composer-when');
        if (when) when.value = '';
        scheduleRow?.classList.add('hidden');
        document.getElementById('attach-schedule')?.classList.remove('is-on');
      });

      const fileInput = document.getElementById('pdf-input');
      fileInput?.addEventListener('change', async (event) => {
        if (event.target.files.length) await acceptDocuments(event.target.files);
        event.target.value = '';
      });

      /* Drag and drop over the whole zone. The counter is because dragging over
         a child fires leave on the parent, which otherwise makes the highlight
         flicker as the pointer crosses the icon. */
      let depth = 0;
      zone?.addEventListener('dragenter', (event) => { event.preventDefault(); depth += 1; zone.classList.add('is-over'); });
      zone?.addEventListener('dragover', (event) => event.preventDefault());
      zone?.addEventListener('dragleave', () => { depth -= 1; if (depth <= 0) { depth = 0; zone.classList.remove('is-over'); } });
      zone?.addEventListener('drop', async (event) => {
        event.preventDefault();
        depth = 0;
        zone.classList.remove('is-over');
        if (event.dataTransfer?.files?.length) await acceptDocuments(event.dataTransfer.files);
      });
      // The dictate control itself lives in a hidden slot so the toolbar keeps
      // one consistent row of icons; this button drives it.
      document.getElementById('attach-dictate')?.addEventListener('click', () =>
        document.querySelector('#dictate-slot .dictate-btn')?.click());

      /* Dragging a file onto the dialog rather than onto the folded-away zone is
         the obvious thing to try, so it opens the zone and takes the file. */
      const form = document.getElementById('thread-form');
      form.addEventListener('dragover', (event) => event.preventDefault());
      form.addEventListener('drop', async (event) => {
        if (!admin || !event.dataTransfer?.files?.length) return;
        event.preventDefault();
        reveal(zone, 'attach-file');
        await acceptDocuments(event.dataTransfer.files);
      });
      const bodyField = document.getElementById('composer-body');
      bodyField.addEventListener('input', debounce(showVideoPreview, 250));
      bodyField.addEventListener('paste', () => setTimeout(showVideoPreview, 30));
      showVideoPreview();
      document.getElementById('save-thread').addEventListener('click', submitComposer);
    },
  });
}

/* What the pasted link will turn into, shown while it is still being written.
   The server does the real extraction on submit; this only has to agree with it
   about what counts as a video. */
function showVideoPreview() {
  const holder = document.getElementById('video-preview');
  if (!holder) return;
  const text = document.getElementById('composer-body')?.value || '';
  const found = [];
  for (const word of text.split(/\s+/)) {
    const video = videoEmbed(word);
    if (video && !found.some((item) => item.src === video.src)) found.push(video);
    if (found.length >= 3) break;
  }
  holder.innerHTML = found.map((video) => `<div class="att-video"><iframe src="${escapeHtml(video.src)}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
    allowfullscreen title="${video.kind === 'loom' ? 'Loom video' : 'YouTube video'}"></iframe></div>`).join('');
  holder.classList.toggle('hidden', !found.length);
}

async function submitComposer() {
  const form = document.getElementById('thread-form');
  const data = new FormData(form);
  const body = {
    title: String(data.get('title') || '').trim(),
    body: String(data.get('body') || '').trim(),
    categoryId: data.get('categoryId') || null,
    attachments: draftAttachments
      // A row that failed or is still going up has no address to save.
      .filter((item) => item.url && !item.error)
      .map(({ kind, url, storedName, fileName, mimeType, sizeBytes }) =>
        (kind === 'file' ? { kind, url, storedName, fileName, mimeType, sizeBytes } : { kind, url })),
  };
  if (!body.title || !body.body) return showToast('Give your post a line and a message.', 'error');
  /* Checked after the writing, so somebody who has typed a post is not stopped
     before they have said anything — and the picker marks itself rather than
     leaving a toast to explain a control further up the screen. */
  if (!categoryChosen()) return showToast('Choose where this post belongs.', 'error');
  if (isAdmin()) {
    body.pinned = form.pinned.checked;
    const when = document.getElementById('composer-when')?.value;
    if (when) {
      const at = fromZonedInput(when);
      if (new Date(at).getTime() <= Date.now()) return showToast('Pick a time in the future, or post it now.', 'error');
      body.publishedAt = at;
    }
  }
  try {
    await api(isAdmin() ? `/api/admin/community/${state.communityClassId}/threads` : '/api/student/community/threads',
      { method: 'POST', body });
    closeModal();
    draftAttachments = [];
    composerDraft = null;
    await reloadBoard();
    showToast(body.publishedAt ? 'Scheduled' : 'Posted');
  } catch (error) { showToast(error.message, 'error'); }
}

/* ------------------------------------------------------------------
   Reading
   ------------------------------------------------------------------ */

/* In the feed an attachment is a hint that there is more inside: a GIF plays
   because a still GIF is pointless, a Loom shows as a strip rather than sixteen
   iframes on one screen, and a PDF is a line you can open. */
function attachmentsPreview(items = [], full = false) {
  if (!items.length) return '';
  return `<div class="att">${items.map((item) => {
    if (item.kind === 'gif') return `<img class="att-gif" src="${escapeHtml(item.url)}" alt="GIF" loading="lazy">`;
    if (item.kind === 'loom' || item.kind === 'youtube') {
      const video = videoEmbed(item.url);
      if (!video) return '';
      const label = video.kind === 'loom' ? 'Loom video' : 'YouTube video';
      /* Players are embedded everywhere, in the feed as well as inside a post.
         A strip saying "watch this elsewhere" is a worse version of the thing
         it is standing in for. */
      /* The attribute set YouTube's own embed code ships with. Without the
         referrer policy some browsers send no referrer at all and YouTube
         answers with a player configuration error rather than the video. */
      return `<div class="att-video"><iframe src="${escapeHtml(video.src)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen loading="lazy" title="${label}"></iframe></div>`;
    }
    const format = /\.docx$/i.test(item.fileName || '') || String(item.mimeType || '').includes('wordprocessingml')
      ? 'DOCX' : 'PDF';
    return `<a class="att-strip" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      ${svg.note}<span>${escapeHtml(item.fileName || 'Document')}</span><em>${format}</em></a>`;
  }).join('')}</div>`;
}

function feedPost(thread, admin) {
  const comments = thread.comment_count || 0;
  const body = String(thread.body || '');
  const clipped = body.length > 300;
  return `<article class="post ${thread.deleted_at ? 'is-removed' : ''} ${thread.scheduled ? 'is-scheduled' : ''}" data-open-thread="${thread.id}">
    <header class="post-top">
      ${boardAvatar(thread.author)}
      <div class="post-who">
        <span class="post-name">${escapeHtml(thread.author?.name || 'Removed account')}${thread.author?.role === 'admin' ? '<i class="tag-teacher">Teacher</i>' : ''}</span>
        <span class="post-meta">
          ${thread.scheduled ? `<b class="tag-sched">Scheduled ${escapeHtml(scheduledFor(thread.published_at))}</b>` : escapeHtml(timeAgo(thread.published_at || thread.created_at))}
          ${thread.pinned ? ' · <b>Pinned</b>' : ''}
          ${thread.locked && admin ? ' · Closed' : ''}
          ${thread.deleted_at && admin ? ' · <b class="tag-removed">Removed</b>' : ''}
        </span>
      </div>
      ${thread.category_name ? `<span class="post-cat">${escapeHtml(thread.category_name)}</span>` : ''}
    </header>
    <h3 class="post-title">${escapeHtml(thread.title)}</h3>
    <p class="post-body">${escapeHtml(body.slice(0, 300))}${clipped ? '…' : ''}</p>
    ${attachmentsPreview(thread.attachments)}
    <footer class="post-foot">
      ${reactionRow('thread', thread.id, thread.reactions)}
      <button class="act flat">${svg.comment}<span>${comments || ''}</span></button>
      ${thread.last_comment
        ? `<span class="post-last">
             ${boardAvatar({ id: thread.last_comment.id, name: thread.last_comment.name, avatar: thread.last_comment.avatar }, 'xs')}
             <span>Last comment ${escapeHtml(timeAgo(thread.last_comment.at))}</span>
           </span>`
        : ''}
    </footer>
  </article>`;
}

function feedComposerBar() {
  return `<button class="composer" id="open-composer">
    ${boardAvatar(me())}
    <span class="composer-hint">Write something to the class…</span>
    <span class="composer-icons">${svg.note}${svg.paperclip}${svg.video}</span>
  </button>`;
}

/* Pills, scrolling sideways when there are more than fit. Underlined tabs made
   the row look like page navigation; these read as filters, which is what they
   are. */
function feedFilters() {
  const categories = state.community?.categories || [];
  const active = state.boardCategoryId || '';
  const chip = (id, label) => `<button class="cat ${active === id ? 'on' : ''}" data-board-category="${id}">${escapeHtml(label)}</button>`;
  return `<div class="filters">
    <div class="cats">
      ${chip('', 'All')}
      ${categories.map((row) => chip(row.id, row.name)).join('')}
    </div>
    <div class="sorts">
      ${isAdmin() ? `<div class="seg board-state">
        <button class="seg-btn ${!state.boardState ? 'on' : ''}" data-board-state="">All</button>
        <button class="seg-btn ${state.boardState === 'open' ? 'on' : ''}" data-board-state="open">Open</button>
        <button class="seg-btn ${state.boardState === 'closed' ? 'on' : ''}" data-board-state="closed">Closed</button>
      </div>` : ''}
      <button class="sort ${state.boardSort !== 'hot' ? 'on' : ''}" data-board-sort="new">Latest</button>
      <button class="sort ${state.boardSort === 'hot' ? 'on' : ''}" data-board-sort="hot">Hot</button>
    </div>
  </div>`;
}

/* The column beside the feed.
   ------------------------------------------------------------------
   It carried a stat block with one number in it — how many posts the board had
   — which is a figure nobody has ever needed. What a person actually wants
   here is when they next have to be somewhere, so the next class moved in and
   the counter went out. The leaderboard stays: it is the one thing in the
   column that makes somebody post again. */
function feedSide() {
  const data = state.community;
  const klass = isAdmin() ? data?.class : state.studentData?.class;
  // The teacher gets it from the board payload, a student from their bootstrap.
  const next = isAdmin() ? data?.nextClass : state.studentData?.nextClass;
  const contributors = data?.contributors || [];

  return `<aside class="side">
    <section class="side-card side-class">
      <div class="side-top">
        <div class="side-mark">${escapeHtml(initials(klass?.programme_name || 'GG'))}</div>
        <div>
          <strong>${escapeHtml(klass?.programme_name || 'Your class')}</strong>
          <span>${escapeHtml(klass ? `${DAY_NAMES[klass.day_of_week]}s at ${String(klass.start_time).slice(0, 5)}` : '')}</span>
        </div>
      </div>
      ${next ? sideNextClass(next) : ''}
    </section>

    <section class="side-card">
      <h4>Most active this month</h4>
      ${contributors.length
        ? `<ol class="rank">${contributors.map((row, index) => `<li class="${index < 3 ? 'is-top' : ''}">
            <span class="rank-n">${index + 1}</span>
            ${boardAvatar({ id: row.id, name: row.name, avatar: row.avatar }, 'sm')}
            <span class="rank-name">${escapeHtml(row.name)}</span>
            <span class="rank-v">${row.total}</span>
          </li>`).join('')}</ol>`
        : '<p class="side-empty">Nobody has posted yet this month. Be the first.</p>'}
    </section>
  </aside>`;
}

/* The next class, in the column rather than only on the deadlines screen —
   somebody reading the board on a Monday evening should not have to go looking
   for the link. Wording follows the banner: a countdown when it is close, the
   day otherwise. */
function sideNextClass(next) {
  /* In the class timezone, not the reader's. Formatted in a browser set to
     Singapore, a seven o'clock Monday class in Dublin reads as Tuesday — and
     the banner two inches above it would still say Monday. */
  const label = next.live
    ? 'Happening now'
    : next.soon
      ? `Starts in ${relativeWhen(next.minutesAway)}`
      : new Date(next.startsAt).toLocaleDateString('en-IE', {
          weekday: 'long', day: 'numeric', month: 'short',
          timeZone: next.timezone || 'Europe/Dublin',
        });
  return `<div class="side-next ${next.live ? 'is-live' : ''}">
    <div class="side-next-copy">
      <span>${next.isExtra ? 'Extra session' : 'Next class'}</span>
      <strong>${escapeHtml(label)}</strong>
      ${next.note ? `<em>${escapeHtml(/^pass\s*code/i.test(next.note) || !next.joinUrl ? `Passcode: ${passcodeOnly(next.note)}` : next.note)}</em>` : ''}
    </div>
    ${next.joinUrl && (next.live || next.soon)
      ? `<a class="btn primary small" href="${escapeHtml(next.joinUrl)}" target="_blank" rel="noopener">Join</a>`
      : ''}
  </div>`;
}

/** "40 minutes", "3 hours" — enough precision for a countdown, no more. */
function relativeWhen(minutes) {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function feedEmpty(admin) {
  return `<div class="feed-empty">
    <h3>${state.boardCategoryId ? 'Nothing here yet' : 'No posts yet'}</h3>
    <p>${admin
      ? 'Start it off with something worth replying to — a question about the last class, or where to find this week’s notes. An empty feed stays empty until somebody goes first, and it is usually easier for that somebody to be you.'
      : 'Be the first. A question you think is too simple is usually the one three other people were also wondering about.'}</p>
  </div>`;
}

function feedLayout(admin) {
  const all = state.community?.threads || [];
  /* Filtered here rather than on the server: the board is one class's posts and
     already all in hand, so a round trip to hide some of them would be slower
     and no more correct. Students never set this. */
  const threads = admin && state.boardState
    ? all.filter((thread) => (state.boardState === 'closed' ? thread.locked : !thread.locked))
    : all;
  return `<div class="feed">
    <div class="feed-col">
      ${feedComposerBar()}
      ${feedFilters()}
      ${threads.length
        ? `<div class="posts">${threads.map((thread) => feedPost(thread, admin)).join('')}</div>`
        : (admin && state.boardState
            ? `<div class="feed-empty"><h3>Nothing ${escapeHtml(state.boardState)}</h3>
                <p>No posts on this board are ${escapeHtml(state.boardState)} at the moment.</p></div>`
            : feedEmpty(admin))}
    </div>
    ${feedSide()}
  </div>`;
}

function communityView() {
  const classes = state.classes || [];
  return `<div class="feed-head">
      <div>
        <h1>Community</h1>
        <p>One feed per class. Pin, close, remove or schedule anything.</p>
      </div>
      <div class="feed-head-actions">
        <select class="select" id="community-class">${classes.map((row) => `<option value="${row.id}" ${row.id === state.communityClassId ? 'selected' : ''}>${escapeHtml(classLabel(row))}</option>`).join('')}</select>
        <button class="btn" id="manage-categories">Categories</button>
        <button class="btn" id="open-schedule-plan">${svg.calendar} Scheduled</button>
      </div>
    </div>
    ${feedLayout(true)}`;
}

function studentCommunityView() {
  return `${studentHeader()}${feedLayout(false)}`;
}

/* ------------------------------------------------------------------
   One post
   ------------------------------------------------------------------ */

async function openThread(threadId) {
  let thread;
  try { thread = await api(`${boardApi()}/community/thread/${threadId}`); }
  catch (error) { return showToast(error.message, 'error'); }
  state.communityThread = thread;
  renderThreadDrawer();
}

function feedComment(comment, admin) {
  const removed = Boolean(comment.deleted_at);
  return `<article class="cmt ${removed ? 'is-removed' : ''}">
    ${boardAvatar(comment.author, 'sm')}
    <div class="cmt-body">
      <div class="cmt-head">
        <span class="post-name">${escapeHtml(comment.author?.name || 'Removed account')}${comment.author?.role === 'admin' ? '<i class="tag-teacher">Teacher</i>' : ''}</span>
        <span class="post-meta">${escapeHtml(timeAgo(comment.created_at))}</span>
        ${admin ? `<button class="cmt-remove" data-post-removal="${comment.id}" data-removed="${removed}">${removed ? 'Restore' : 'Remove'}</button>` : ''}
      </div>
      ${removed
        ? '<p class="cmt-gone">This comment was removed.</p>'
        : `${comment.body ? `<div class="cmt-text">${escapeHtml(comment.body).replace(/\n/g, '<br>')}</div>` : ''}
           ${comment.voice_note ? `<div class="cmt-voice">${voiceNotePlayer(comment.voice_note)}</div>` : ''}
           ${reactionRow('post', comment.id, comment.reactions, 'sm')}`}
    </div>
  </article>`;
}

function renderThreadDrawer() {
  const thread = state.communityThread;
  if (!thread) return;
  const admin = isAdmin();
  const withdrawn = Boolean(state.studentData?.withdrawnAt);
  const canComment = admin || (!thread.locked && !withdrawn);
  const comments = thread.comments || [];
  openDrawer({
    title: thread.title,
    subtitle: `${thread.author?.name || 'Removed account'} · ${timeAgo(thread.published_at || thread.created_at)}${thread.category_name ? ` · ${thread.category_name}` : ''}`,
    body: `
      ${admin ? `<div class="mod-bar">
        <button class="btn small" data-thread-pin="${thread.id}" data-pinned="${thread.pinned}">${thread.pinned ? 'Unpin' : 'Pin'}</button>
        <button class="btn small" data-thread-lock="${thread.id}" data-locked="${thread.locked}">${thread.locked ? 'Reopen' : 'Close'}</button>
        <button class="btn small" id="reschedule">${thread.scheduled ? 'Reschedule' : 'Schedule'}</button>
        <button class="btn small ${thread.deleted_at ? '' : 'danger'}" data-thread-removal="${thread.id}" data-removed="${Boolean(thread.deleted_at)}">${thread.deleted_at ? 'Restore' : 'Remove'}</button>
      </div>` : ''}
      ${thread.scheduled ? `<div class="sched-note">Not visible to students yet. Appears ${escapeHtml(fmtDate(thread.published_at, { weekday: true, time: true, dateStyle: 'medium' }))}.</div>` : ''}
      <article class="opening">
        <div class="post-top">
          ${boardAvatar(thread.author)}
          <div class="post-who">
            <span class="post-name">${escapeHtml(thread.author?.name || 'Removed account')}${thread.author?.role === 'admin' ? '<i class="tag-teacher">Teacher</i>' : ''}</span>
            <span class="post-meta">${escapeHtml(timeAgo(thread.published_at || thread.created_at))}</span>
          </div>
        </div>
        <div class="cmt-text">${escapeHtml(String(thread.body || '')).replace(/\n/g, '<br>')}</div>
        ${attachmentsPreview(thread.attachments, true)}
        ${reactionRow('thread', thread.id, thread.reactions)}
      </article>
      <h4 class="cmt-count">${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}</h4>
      <div class="cmts">${comments.map((comment) => feedComment(comment, admin)).join('') || '<p class="side-empty">No comments yet.</p>'}</div>
      ${admin ? `<div class="rd" id="reply-draft"><p class="muted small">Drafting a reply…</p></div>` : ''}
      ${canComment ? `<div class="reply">
        ${boardAvatar(me(), 'sm')}
        <div class="reply-box">
          ${dictateButton('reply-body')}
          <textarea id="reply-body" rows="2" data-grow placeholder="Write a comment"></textarea>
          <div class="reply-actions">
            ${emojiButton('reply-body')}
            <button class="btn primary" id="send-reply">Comment</button>
            ${admin ? replyRecorder() : ''}
          </div>
        </div>
      </div>` : `<p class="side-empty">${withdrawn ? 'You have withdrawn from this course, so posting is closed.' : 'This post has been closed to new comments.'}</p>`}`,
    onOpen() {
      bindDictation();
      bindReactions(modalRoot);
      bindEmojiButtons(modalRoot);
      bindAutoGrow(modalRoot);
      if (admin) loadReplyDraft(thread.id);
      if (admin) bindReplyRecorder();
      document.getElementById('send-reply')?.addEventListener('click', async () => {
        const body = document.getElementById('reply-body').value.trim();
        // A voice note can carry the whole reply, so the box may be empty when
        // there is a recording to send with it.
        if (!body && !pendingReplyAudio) return showToast('Write a comment, or record one.', 'error');
        try {
          const comment = await api(`${boardApi()}/community/thread/${thread.id}/replies`, {
            method: 'POST', body: { body: body || '🎧' },
          });
          if (pendingReplyAudio) {
            const form = new FormData();
            form.append('audio', pendingReplyAudio.blob, audioFileName(pendingReplyAudio.blob));
            form.append('seconds', String(pendingReplyAudio.seconds));
            await api(`/api/admin/voice-note/comment/${comment.id}`, { method: 'POST', body: form });
            pendingReplyAudio = null;
          }
          await openThread(thread.id);
          await reloadBoard();
        } catch (error) { showToast(error.message, 'error'); }
      });
      document.querySelector('[data-thread-pin]')?.addEventListener('click', (event) =>
        updateThread(thread.id, { pinned: event.currentTarget.dataset.pinned !== 'true' }));
      document.querySelector('[data-thread-lock]')?.addEventListener('click', (event) =>
        updateThread(thread.id, { locked: event.currentTarget.dataset.locked !== 'true' }));
      document.getElementById('reschedule')?.addEventListener('click', () => openScheduleModal(thread));
      document.querySelector('[data-thread-removal]')?.addEventListener('click', async (event) => {
        const removed = event.currentTarget.dataset.removed !== 'true';
        if (removed && !(await askConfirm({
          title: 'Remove this post?',
          message: 'Students stop seeing it immediately. The comments are kept and you can restore the whole post at any time.',
          confirmLabel: 'Remove', danger: true,
        }))) return;
        try {
          await api(`/api/admin/community/thread/${thread.id}/removal`, { method: 'POST', body: { removed } });
          await openThread(thread.id); await reloadBoard();
          showToast(removed ? 'Post removed' : 'Post restored');
        } catch (error) { showToast(error.message, 'error'); }
      });
      modalRoot.querySelectorAll('[data-post-removal]').forEach((button) => button.addEventListener('click', async () => {
        try {
          await api(`/api/admin/community/post/${button.dataset.postRemoval}/removal`, { method: 'POST', body: { removed: button.dataset.removed !== 'true' } });
          await openThread(thread.id); await reloadBoard();
        } catch (error) { showToast(error.message, 'error'); }
      }));
    },
  });
}

/* A term of posts in one go.
   ------------------------------------------------------------------
   Writing next term's twelve posts one at a time through the composer is the
   job this replaces. The planning already happens in a spreadsheet, so the
   spreadsheet is what it takes.

   Two screens: what is already queued, and bringing in a file. The file is read
   and shown back before anything is written, because a bad date in row nine
   should not leave eight posts on the board. */
async function openSchedulePlan() {
  let plan;
  try { plan = await api(`/api/admin/community/${state.communityClassId}/scheduled`); }
  catch (error) { return showToast(error.message, 'error'); }

  modal({
    title: 'Scheduled posts',
    subtitle: `Not yet visible to students. Times in ${plan.timezone}.`,
    wide: true,
    body: `<div class="plan">
      ${plan.posts.length ? scheduleCalendar(plan) : `<div class="plan-empty">
        <strong>Nothing is queued</strong>
        <span>Posts you schedule, one at a time or from a spreadsheet, wait here until their date.</span>
      </div>`}
    </div>`,
    footer: `<button class="btn" data-close-modal>Close</button>
      <button class="btn" id="download-template">Download template</button>
      <button class="btn primary" id="open-schedule-import">Import a spreadsheet</button>`,
    onOpen() {
      document.getElementById('open-schedule-import').addEventListener('click', openScheduleImport);
      document.getElementById('download-template').addEventListener('click', downloadScheduleTemplate);
      bindPlanRows();
    },
  });
}

/* Month by month, because a term is planned in months. A day with something on
   it carries the post; the rest are there to give the dates somewhere to sit. */
function scheduleCalendar(plan) {
  /* Everything here is read in the class timezone, not the reader's. A teacher
     checking the plan from abroad wants to know that the post goes out at nine
     on a Tuesday morning in Dublin — rendering it in their own clock would put
     it in the wrong cell as well as at the wrong time, and the heading already
     promises Dublin. */
  const zone = plan.timezone || 'Europe/Dublin';
  const inZone = (iso) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso)).reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
    return {
      year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
      time: `${parts.hour}:${parts.minute}`,
    };
  };

  const byDay = new Map();
  let earliest = null;
  let latest = null;
  for (const post of plan.posts) {
    const at = inZone(post.published_at);
    const key = `${at.year}-${at.month}-${at.day}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ ...post, at });
    const stamp = at.year * 12 + at.month;
    if (earliest === null || stamp < earliest) earliest = stamp;
    if (latest === null || stamp > latest) latest = stamp;
  }

  const months = [];
  for (let stamp = earliest; stamp <= latest; stamp += 1) {
    months.push({ year: Math.floor((stamp - 1) / 12), month: ((stamp - 1) % 12) + 1 });
  }

  return months.map(({ year, month }) => {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    // Monday-first, matching the rest of the application.
    const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

    const cells = [
      ...Array.from({ length: lead }, () => '<div class="plan-cell is-blank"></div>'),
      ...Array.from({ length: days }, (_, index) => {
        const posts = byDay.get(`${year}-${month}-${index + 1}`) || [];
        return `<div class="plan-cell ${posts.length ? 'has-post' : ''}">
          <span class="plan-date">${index + 1}</span>
          ${posts.map((post) => `<button type="button" class="plan-chip" data-plan-post="${post.id}"
            title="${escapeHtml(post.title)}">
            <b>${escapeHtml(post.at.time)}</b>
            <span>${escapeHtml(post.title)}</span>
          </button>`).join('')}
        </div>`;
      }),
    ];

    return `<section class="plan-month">
      <h4>${escapeHtml(new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IE', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</h4>
      <div class="plan-grid">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => `<div class="plan-head">${day}</div>`).join('')}
        ${cells.join('')}
      </div>
    </section>`;
  }).join('');
}

function bindPlanRows() {
  document.querySelectorAll('[data-plan-post]').forEach((button) => button.addEventListener('click', async () => {
    closeModal();
    await openThread(button.dataset.planPost);
  }));
}

/* Fetched rather than linked to. A plain download link would leave the page,
   and a failure would land somebody on a bare error rather than telling them
   what went wrong where they are. */
async function downloadScheduleTemplate() {
  try {
    const response = await fetch(`/api/admin/community/${state.communityClassId}/schedule-template`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('The template could not be prepared.');
    const url = URL.createObjectURL(new Blob([await response.text()], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scheduled-posts-template.csv';
    document.body.append(link);
    link.click();
    link.remove();
    // Freed on the next turn of the loop, once the browser has taken it.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) { showToast(error.message, 'error'); }
}

/* The file, read and shown back before anything is written. */
function openScheduleImport() {
  modal({
    title: 'Import scheduled posts',
    subtitle: 'One row per post. Nothing is written until you have seen what it read.',
    wide: true,
    body: `<label class="fu-zone" id="csv-zone">
        <input class="fu-input" type="file" id="csv-input" accept=".csv,text/csv">
        <span class="fu-icon">${svg.cloudUp}</span>
        <span class="fu-lead"><b>Click to upload</b> or drag a CSV here</span>
        <span class="fu-hint">Columns: Date, Title, Body, Category, Pinned</span>
      </label>
      <p class="muted small">Dates can be written 25/12/2026 09:00 or 2026-12-25T09:00. A category must already exist. Not sure of the shape? <button type="button" class="text-link" id="template-link">Download the template</button>.</p>
      <div id="csv-preview"></div>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="csv-import" disabled>Import</button>`,
    onOpen() {
      document.getElementById('template-link')?.addEventListener('click', downloadScheduleTemplate);
      const input = document.getElementById('csv-input');
      const zone = document.getElementById('csv-zone');
      const preview = document.getElementById('csv-preview');
      const importButton = document.getElementById('csv-import');
      let chosen = null;

      const read = async (file) => {
        if (!file) return;
        chosen = file;
        preview.innerHTML = '<p class="muted small">Reading…</p>';
        importButton.disabled = true;
        const form = new FormData();
        form.append('file', file);
        let result;
        try { result = await api(`/api/admin/community/${state.communityClassId}/schedule-preview`, { method: 'POST', body: form }); }
        catch (error) { preview.innerHTML = `<p class="csv-bad">${escapeHtml(error.message)}</p>`; return; }
        preview.innerHTML = schedulePreview(result);
        importButton.disabled = result.ready === 0;
        importButton.textContent = result.ready
          ? `Schedule ${result.ready} post${result.ready === 1 ? '' : 's'}`
          : 'Nothing to import';
      };

      input.addEventListener('change', () => read(input.files?.[0]));
      ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (event) => {
        event.preventDefault(); zone.classList.add('is-over');
      }));
      ['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, () => zone.classList.remove('is-over')));
      zone.addEventListener('drop', (event) => { event.preventDefault(); read(event.dataTransfer?.files?.[0]); });

      importButton.addEventListener('click', async () => {
        if (!chosen) return;
        const form = new FormData();
        form.append('file', chosen);
        importButton.disabled = true;
        try {
          const result = await api(`/api/admin/community/${state.communityClassId}/schedule-import`, { method: 'POST', body: form });
          closeModal();
          await reloadBoard();
          showToast(`${result.created} post${result.created === 1 ? '' : 's'} scheduled${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}`);
        } catch (error) { importButton.disabled = false; showToast(error.message, 'error'); }
      });
    },
  });
}

/* Every row, in file order, with its problems named. A row is either going in
   or it is not, and it says which — a count alone leaves somebody guessing
   which nine of their twelve posts made it. */
function schedulePreview(result) {
  return `<div class="csv-summary">
      <span class="csv-ok">${result.ready} ready</span>
      ${result.problems ? `<span class="csv-bad">${result.problems} with problems</span>` : ''}
      <span class="muted small">Times read as ${escapeHtml(result.timezone)}</span>
    </div>
    <div class="table-wrap"><table class="data-table compact">
      <thead><tr><th>Row</th><th>When</th><th>Title</th><th>Category</th><th></th></tr></thead>
      <tbody>${result.rows.map((row) => `<tr class="${row.problems.length ? 'is-bad' : ''}">
        <td>${row.line}</td>
        <td>${escapeHtml(row.localWhen || '—')}${row.past && !row.problems.length ? '<b class="csv-note">publishes at once</b>' : ''}</td>
        <td>${escapeHtml(row.title || '—')}${row.pinned ? ' <span class="pill">Pinned</span>' : ''}</td>
        <td>${escapeHtml(row.categoryName || '—')}</td>
        <td>${row.problems.length
          ? `<span class="csv-bad">${escapeHtml(row.problems.join('; '))}</span>`
          : '<span class="csv-ok">will be scheduled</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

function openScheduleModal(thread) {
  modal({
    title: thread.scheduled ? 'Reschedule' : 'Schedule this post',
    subtitle: `Times in ${classTimezone()}.`,
    body: `<div class="form-field"><label for="sched-when">Appears to students at</label>
        <input type="datetime-local" id="sched-when" value="${toZonedInput(thread.published_at)}"></div>
      <p class="muted small">Setting a time in the past publishes it immediately.</p>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="save-schedule">Save</button>`,
    onOpen() {
      document.getElementById('save-schedule').addEventListener('click', async () => {
        const value = document.getElementById('sched-when').value;
        if (!value) return showToast('Pick a time.', 'error');
        try {
          await api(`/api/admin/community/thread/${thread.id}/schedule`, { method: 'PATCH', body: { publishedAt: fromZonedInput(value) } });
          closeModal(); await openThread(thread.id); await reloadBoard(); showToast('Schedule saved');
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

/* Reactions update the one row that was touched. A feed that jumps back to the
   top every time somebody reacts is a feed people stop reacting on. */
async function react(type, id, emoji) {
  let result;
  try { result = await api(`${boardApi()}/community/react/${type}/${id}`, { method: 'POST', body: { emoji } }); }
  catch (error) { return showToast(error.message, 'error'); }
  applyReactions(type, id, result.reactions);
  if (state.communityThread?.id === id) state.communityThread.reactions = result.reactions;
}

function bindReactions(root = document) {
  root.querySelectorAll('[data-react]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      react(button.dataset.react, button.dataset.id, button.dataset.emoji);
    });
  });
  root.querySelectorAll('[data-react-open]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openReactionPicker(button, button.dataset.reactOpen, button.dataset.id);
    });
  });
}

/* A small row of emoji anchored to the button that opened it. Closes on the next
   click anywhere, which is what people expect of something this light. */
function openReactionPicker(anchor, type, id) {
  document.querySelector('.rx-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'rx-pop';
  pop.innerHTML = REACTIONS.map((emoji) => `<button data-pick="${emoji}">${emoji}</button>`).join('');
  document.body.append(pop);

  const box = anchor.getBoundingClientRect();
  const width = pop.offsetWidth;
  // Kept on screen: near the button, but never hanging off either edge.
  pop.style.left = `${Math.min(Math.max(8, box.left), window.innerWidth - width - 8)}px`;
  pop.style.top = box.top > 260 ? `${box.top - pop.offsetHeight - 8}px` : `${box.bottom + 8}px`;

  pop.querySelectorAll('[data-pick]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    pop.remove();
    react(type, id, button.dataset.pick);
  }));
  setTimeout(() => document.addEventListener('click', () => pop.remove(), { once: true }), 0);
}

/* The drafted reply.
   ------------------------------------------------------------------
   Written when the post is first opened and kept, so opening it twice does not
   draft it twice. It sits above the box rather than inside it: a draft that
   fills the box is a draft you have to delete before you can disagree with it,
   and the point is that using it is a choice.

   Never rendered for a student — this whole function is behind an admin check
   at the one call site, and the field it reads is stripped from every student
   payload on the server as well. */
/**
 * Let a text box grow to fit what is in it.
 *
 * A fixed row count is right for an empty box and wrong the moment there is
 * anything in it: a comment of any length gets a scrollbar and a three-line
 * window onto itself. Capped, so a very long reply does not push the buttons off
 * the screen — past that it does scroll, which by then is the lesser evil.
 */
function autoGrow(field, { min = 2, max = 14 } = {}) {
  if (!field) return;
  /* Counted rather than measured. The obvious implementation reads scrollHeight
     after resetting the height, and in this dialog that reports a figure from
     the surrounding layout rather than from the text — an empty box claiming to
     need three hundred pixels. Rows are a native property of a textarea, need no
     measurement, and cannot be thrown off by whatever the box happens to sit in.

     Wrapping is estimated from the column width, which is what makes a single
     long paragraph grow rather than sitting on one row with a scrollbar. */
  const columns = Math.max(20, Math.floor(field.clientWidth / 8) || 60);
  const lines = String(field.value || '').split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / columns)), 0);
  field.rows = Math.min(Math.max(lines, min), max);
}

/** Every box that should grow as it is typed into. */
function bindAutoGrow(root = document) {
  root.querySelectorAll('textarea[data-grow]').forEach((field) => {
    if (field.dataset.growBound) return;
    field.dataset.growBound = '1';
    field.addEventListener('input', () => autoGrow(field));
    autoGrow(field);
  });
}

async function loadReplyDraft(threadId, { regenerate = false } = {}) {
  const holder = document.getElementById('reply-draft');
  if (!holder) return;
  holder.innerHTML = `<p class="muted small">${regenerate ? 'Drafting again…' : 'Drafting a reply…'}</p>`;
  let result;
  try { result = await api(`/api/admin/community/thread/${threadId}/draft`, { method: 'POST', body: { regenerate } }); }
  catch (error) {
    holder.innerHTML = `<div class="rd-fail">${escapeHtml(error.message)}</div>`;
    return;
  }
  if (result.state !== 'drafted' || !result.draft) {
    holder.innerHTML = `<div class="rd-fail">No draft this time. Write your own, or
      <button class="text-link" data-redraft="1">try again</button>.</div>`;
  } else {
    holder.innerHTML = `<div class="rd-head">
        <span>Suggested reply</span>
        <span class="rd-tools">
          <button class="text-link" data-use-draft="1">Edit this</button>
          <button class="text-link" data-redraft="1">Draft again</button>
        </span>
      </div>
      <div class="rd-body">${escapeHtml(result.draft).replace(/\n/g, '<br>')}</div>`;
  }
  holder.querySelector('[data-use-draft]')?.addEventListener('click', () => {
    const box = document.getElementById('reply-body');
    if (!box) return;
    box.value = result.draft;
    /* Grown to fit before it is scrolled to, because a five-line draft dropped
       into a three-line box shows a third of itself and hides the rest behind a
       scrollbar — which is no way to edit something you are about to send under
       your own name. */
    autoGrow(box);
    box.focus();
    // Cursor at the end, because the first thing anybody does is edit it.
    box.setSelectionRange(box.value.length, box.value.length);
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    /* The panel has done its job. Leaving the draft on screen beside a box that
       now contains the same words invites editing the wrong one. */
    holder.classList.add('is-used');
    holder.querySelector('.rd-body')?.classList.add('hidden');
    const head = holder.querySelector('.rd-head span');
    if (head) head.textContent = 'Moved into your comment below';
  });
  holder.querySelector('[data-redraft]')?.addEventListener('click', () => loadReplyDraft(threadId, { regenerate: true }));
}

/* Recording a reply.
   ------------------------------------------------------------------
   Held in memory until the comment is sent, because the comment it belongs to
   does not exist until then. One action from the teacher's side: record, then
   press Comment. */
let pendingReplyAudio = null;
let replyRecording = null;

function replyRecorder() {
  if (!voiceSupported()) return '';
  return `<span class="rr">
    <button type="button" class="btn small" id="rr-btn">${svg.mic} Voice note</button>
    <span class="rr-status" id="rr-status"></span>
  </span>`;
}

function bindReplyRecorder() {
  const button = document.getElementById('rr-btn');
  if (!button) return;
  const status = document.getElementById('rr-status');

  button.addEventListener('click', async () => {
    if (replyRecording) {
      const { blob, seconds } = await replyRecording.stop();
      replyRecording = null;
      button.classList.remove('is-recording');
      if (seconds < 0.6) {
        pendingReplyAudio = null;
        status.textContent = '';
        button.innerHTML = `${svg.mic} Voice note`;
        return showToast('That recording was too short.', 'error');
      }
      pendingReplyAudio = { blob, seconds: Math.round(seconds) };
      button.innerHTML = `${svg.mic} Re-record`;
      status.innerHTML = `${fmtDuration(seconds)} ready <button type="button" class="text-link" id="rr-drop">remove</button>`;
      document.getElementById('rr-drop').addEventListener('click', () => {
        pendingReplyAudio = null;
        status.textContent = '';
        button.innerHTML = `${svg.mic} Voice note`;
      });
      return;
    }
    try {
      replyRecording = await startRecording({
        onTick: (seconds) => { status.textContent = fmtDuration(seconds); },
      });
      button.classList.add('is-recording');
      button.innerHTML = `${svg.stop} Stop`;
    } catch (error) { showToast(error.message, 'error'); }
  });
}

async function updateThread(threadId, body) {
  try {
    await api(`/api/admin/community/thread/${threadId}`, { method: 'PATCH', body });
    await openThread(threadId);
    await reloadBoard();
  } catch (error) { showToast(error.message, 'error'); }
}

function openCategoryModal() {
  const categories = state.community?.categories || [];
  modal({
    title: 'Categories',
    subtitle: 'What a post can be filed under.',
    body: `<div class="category-list">${categories.map((row) => `<div class="category-row">
        <strong>${escapeHtml(row.name)}</strong>
        <span class="muted small">${row.thread_count} post${row.thread_count === 1 ? '' : 's'}</span>
        <button class="btn small danger" data-delete-category="${row.id}">Delete</button>
      </div>`).join('') || '<p class="muted small">No categories yet.</p>'}</div>
      <form id="category-form" class="stack-top"><div class="form-field"><label>Add a category</label><input name="name" maxlength="40" placeholder="Pronunciation"></div></form>
      <p class="muted small">Deleting a category leaves its posts where they are; they simply become uncategorised.</p>`,
    footer: `<button class="btn" data-close-modal>Done</button><button class="btn primary" id="add-category">Add</button>`,
    onOpen() {
      document.getElementById('add-category').addEventListener('click', async () => {
        const name = String(new FormData(document.getElementById('category-form')).get('name') || '').trim();
        if (!name) return showToast('Give the category a short name.', 'error');
        try {
          await api(`/api/admin/community/${state.communityClassId}/categories`, { method: 'POST', body: { name } });
          closeModal(); await reloadBoard(); showToast('Category added');
        } catch (error) { showToast(error.message, 'error'); }
      });
      modalRoot.querySelectorAll('[data-delete-category]').forEach((button) => button.addEventListener('click', async () => {
        try {
          await api(`/api/admin/community/categories/${button.dataset.deleteCategory}`, { method: 'DELETE' });
          closeModal(); await reloadBoard(); showToast('Category deleted');
        } catch (error) { showToast(error.message, 'error'); }
      }));
    },
  });
}

/* Wiring shared by both roles, called from bindAdminView and bindStudentView so
   neither has to know how the feed is put together. */
function bindFeed() {
  document.getElementById('open-composer')?.addEventListener('click', openComposer);
  document.getElementById('manage-categories')?.addEventListener('click', openCategoryModal);
  document.getElementById('open-schedule-plan')?.addEventListener('click', openSchedulePlan);
  document.querySelectorAll('[data-board-category]').forEach((button) => button.addEventListener('click', () => {
    state.boardCategoryId = button.dataset.boardCategory || null;
    reloadBoard();
  }));
  document.querySelectorAll('[data-board-sort]').forEach((button) => button.addEventListener('click', () => {
    state.boardSort = button.dataset.boardSort;
    reloadBoard();
  }));
  /* Open and closed are already in hand, so this redraws rather than reloading. */
  document.querySelectorAll('[data-board-state]').forEach((button) => button.addEventListener('click', () => {
    state.boardState = button.dataset.boardState || null;
    renderAdmin();
  }));
  document.querySelectorAll('[data-open-thread]').forEach((card) => card.addEventListener('click', (event) => {
    // The like button and any attachment link live inside the card, so neither
    // should also open it.
    if (event.target.closest('.rx-row') || event.target.closest('a')) return;
    openThread(card.dataset.openThread);
  }));
  bindReactions(document);
}

/* The weekly class link. Lives on the class rather than on each week, because a
   recurring meeting has one link for the term and asking again every week is a
   weekly chance to forget. */
/* Everything about one class in one place: the link, whether it has a board,
   which courses it carries, the extra sittings, and how far people have got
   through the recordings. It was a link-only dialog before, which meant the rest
   had nowhere to live. */
async function openClassSetupModal(classId) {
  let setup;
  try { setup = await api(`/api/admin/classes/${classId}/setup`); }
  catch (error) { return showToast(error.message, 'error'); }
  const klass = setup.class;

  // Kept so a row can be turned into an editor without asking the server again.
  state.classSessions = setup.sessions;

  modal({
    title: 'Class setup',
    subtitle: classLabel(klass),
    wide: true,
    body: `<form id="class-setup-form" class="setup">
      <section class="setup-block">
        <h4>Class link</h4>
        <div class="form-field"><label>Join address</label><input name="joinUrl" type="url" value="${escapeHtml(klass.join_url || '')}" placeholder="https://us02web.zoom.us/j/..."></div>
        <div class="form-field"><label>Note, optional</label><input name="joinNote" maxlength="200" value="${escapeHtml(klass.join_note || '')}" placeholder="Passcode 4821"></div>
        <p class="muted small">Students see this from twelve hours before the class until it is over. Clearing the address removes the banner rather than leaving a button that goes nowhere.</p>
      </section>

      <section class="setup-block">
        <h4>When the course runs</h4>
        <div class="inline-fields">
          <div class="form-field"><label>First day</label><input type="date" name="startsOn" value="${String(klass.starts_on || '').slice(0, 10)}"></div>
          <div class="form-field"><label>Last day</label><input type="date" name="endsOn" value="${String(klass.ends_on || '').slice(0, 10)}"></div>
        </div>
        <p class="muted small">Weekly check-ins are only created inside these dates. Without them the portal makes weeks around today, which is how a course set up in August ends up showing students weeks in August.</p>
      </section>

      <section class="setup-block">
        <h4>Class dates</h4>
        <p class="muted small">Every ${escapeHtml(DAY_NAMES[klass.day_of_week] || 'week')} in the term. Switch off the weeks the class does not meet — bank holidays and mid-terms are marked, but the decision is yours.</p>
        <div id="class-dates">${classDateList(klass, setup.dateChanges || [])}</div>
      </section>

      <section class="setup-block">
        <h4>Community</h4>
        <label class="check-row"><input type="checkbox" name="hasCommunity" ${klass.has_community ? 'checked' : ''}> This class has a board</label>
        <p class="muted small">Turned off, Community disappears from these students’ menu entirely. Anything already posted is kept and comes back if it is turned on again.</p>
      </section>

      <section class="setup-block">
        <h4>Courses</h4>
        ${setup.courses.length ? `<div class="class-picker">${setup.courses.map((course) => `
          <label class="check-row ${course.open_to_all ? 'is-fixed' : ''}">
            <input type="checkbox" name="courseIds" value="${course.id}" ${course.enrolled || course.open_to_all ? 'checked' : ''} ${course.open_to_all ? 'disabled' : ''}>
            ${escapeHtml(course.title)}${course.open_to_all ? ' <span class="pill">Every class</span>' : ''}
          </label>`).join('')}</div>` : '<p class="muted small">No courses yet.</p>'}
      </section>
    </form>

    <section class="setup-block">
      <h4>Extra sessions</h4>
      <p class="muted small">A second evening that week, a catch-up, a moved class. Whichever comes first — this or the weekly slot — is the one students are shown, and a session with its own link uses that instead of the class link.</p>
      <div id="session-list">${sessionRows(setup.sessions, klass.timezone)}</div>
      <form id="session-form" class="session-form">
        <div class="form-field"><label>Date and time</label><input name="startsAt" type="datetime-local" required></div>
        <div class="form-field"><label>Minutes</label><input name="durationMinutes" type="number" value="90" min="15" max="480"></div>
        <div class="form-field"><label>Label, optional</label><input name="label" maxlength="120" placeholder="Catch-up session"></div>
        <div class="form-field"><label>Link, optional</label><input name="joinUrl" type="url" placeholder="Leave empty to use the class link"></div>
        <button type="submit" class="btn">Add session</button>
      </form>
    </section>

    <section class="setup-block">
      <h4>Recordings watched</h4>
      ${setup.recordings.length ? `<div class="table-wrap"><table class="data-table compact">
        <thead><tr><th>Student</th><th>Watched</th><th></th></tr></thead>
        <tbody>${setup.recordings.map((row) => `<tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${row.completed_count} of ${row.lesson_count}</td>
          <td class="pct-cell"><div class="cc-bar"><span style="width:${row.percent}%"></span></div><b>${row.percent}%</b></td>
        </tr>`).join('')}</tbody></table></div>`
        : '<p class="muted small">Nobody is in this class yet, or it has no recordings.</p>'}
    </section>`,
    footer: `<button class="btn" data-close-modal>Close</button><button class="btn primary" id="save-class-setup">Save</button>`,
    onOpen() {
      /* Redrawn a row at a time. The whole list is thirty-nine weeks, and
         rebuilding it on every click would lose the scroll position and any
         half-typed date in another row. */
      const dates = document.getElementById('class-dates');
      const changesFor = () => [...dates.querySelectorAll('[data-date-row]')]
        .map((row) => {
          const chosen = row.querySelector('.date-kind.on')?.dataset.dateKind || 'running';
          if (chosen === 'running') return null;
          const moved = row.querySelector('[data-date-moved]')?.value;
          return {
            onDate: row.dataset.dateRow,
            kind: chosen,
            movedTo: chosen === 'moved' && moved ? fromZonedInput(moved, klass.timezone) : null,
          };
        })
        .filter(Boolean);

      const recount = () => {
        const total = dates.querySelectorAll('[data-date-row]').length;
        const gone = changesFor().filter((change) => change.kind !== 'moved').length;
        const count = document.getElementById('class-date-count');
        if (count) count.textContent = String(total - gone);
      };

      dates?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-date-kind]');
        if (!button) return;
        const date = button.dataset.for;
        const row = dates.querySelector(`[data-date-row="${date}"]`);
        const existing = changesFor().find((change) => change.onDate === date);
        const kind = button.dataset.dateKind;
        row.outerHTML = classDateRow(
          klass, date,
          kind === 'running' ? null : { kind, movedTo: existing?.movedTo || null },
          date < new Date().toISOString().slice(0, 10),
        );
        recount();
        // A week that has just been moved needs a date, so ask for it at once.
        if (kind === 'moved') dates.querySelector(`[data-date-moved="${date}"]`)?.focus();
      });
      dates?.addEventListener('change', (event) => {
        if (event.target.matches('[data-date-moved]')) recount();
      });

      document.getElementById('save-class-setup').addEventListener('click', async () => {
        const form = document.getElementById('class-setup-form');
        const data = new FormData(form);
        try {
          await api(`/api/admin/classes/${classId}`, {
            method: 'PATCH',
            body: {
              joinUrl: String(data.get('joinUrl') || '').trim(),
              joinNote: String(data.get('joinNote') || '').trim(),
              hasCommunity: form.hasCommunity.checked,
              startsOn: String(data.get('startsOn') || '') || null,
              endsOn: String(data.get('endsOn') || '') || null,
              // Courses open to every class are ticked and disabled, so they
              // never appear here — which is right, they are not enrolments.
              courseIds: data.getAll('courseIds'),
            },
          });
          /* Sent whole, after the class itself, because the term dates decide
             which dates exist at all — saving the skips first could file them
             against a term that is about to change. */
          const list = document.getElementById('class-dates');
          if (list?.querySelector('[data-date-row]')) {
            const changes = changesFor();
            /* A week marked as moved with no date would leave students with a
               changed week and no answer about when it is. */
            const homeless = changes.find((change) => change.kind === 'moved' && !change.movedTo);
            if (homeless) {
              document.querySelector(`[data-date-moved="${homeless.onDate}"]`)?.focus();
              return showToast('Give the moved class a new date and time.', 'error');
            }
            await api(`/api/admin/classes/${classId}/date-changes`, { method: 'PUT', body: { changes } });
          }
          closeModal(); await renderAdmin(); showToast('Class saved');
        } catch (error) { showToast(error.message, 'error'); }
      });

      document.getElementById('session-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(event.target);
        if (!data.get('startsAt')) return showToast('Pick a date and time.', 'error');
        try {
          await api(`/api/admin/classes/${classId}/sessions`, {
            method: 'POST',
            body: {
              /* Read as the class's wall clock. This used to be
                 new Date(...), which reads the typed time as the browser's — so
                 a session added from anywhere but Ireland landed at the wrong
                 hour, and nobody would have found out until nobody turned up. */
              startsAt: fromZonedInput(String(data.get('startsAt')), klass.timezone),
              durationMinutes: Number(data.get('durationMinutes')) || 90,
              label: String(data.get('label') || '').trim(),
              joinUrl: String(data.get('joinUrl') || '').trim(),
            },
          });
          event.target.reset();
          await refreshSessions(classId);
          showToast('Session added');
        } catch (error) { showToast(error.message, 'error'); }
      });

      bindSessionRows(classId, klass.timezone);
    },
  });
}

/* Every sitting of the weekly class, so the exceptions can be picked by eye.
   ------------------------------------------------------------------
   Modelled on the check-in scheduler, which had the same problem and solved it
   the same way: a term is a list somebody reads down, ticking off the weeks that
   are not happening. Doing it any other way means remembering which Monday is
   the October bank holiday, which nobody does reliably.

   The holidays are marked but nothing is switched off automatically — a course
   that deliberately runs through a bank holiday is a normal thing, and the
   portal has no business overruling it. */
function classDateList(klass, changes = []) {
  if (!klass.starts_on || !klass.ends_on) {
    return `<p class="muted small">Set the first and last day of the course above, and every class date appears here.</p>`;
  }
  const byDate = new Map(changes.map((change) => [String(change.onDate).slice(0, 10), change]));
  const dates = classDatesFor(klass);
  if (!dates.length) return '<p class="muted small">No class dates fall inside those dates.</p>';

  const today = new Date().toISOString().slice(0, 10);
  return `<ul class="date-list">${dates.map((date) => classDateRow(klass, date, byDate.get(date), date < today)).join('')}</ul>
  <p class="muted small date-count"><strong id="class-date-count">${dates.length - [...byDate.values()].filter((c) => c.kind !== 'moved').length}</strong> of ${dates.length} weeks running live.</p>`;
}

/* One week, and what is happening to it.
   ------------------------------------------------------------------
   Four states rather than a switch, because a week that is off, a week replaced
   by a recording and a week that has moved are three different messages to a
   student — not one absence with a note attached. */
function classDateRow(klass, date, change, past) {
  const kind = change?.kind || 'running';
  const marks = holidaysInWeek(mondayOf(date)).filter((mark) => mark.date === date);
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });

  const said = {
    running: `${String(klass.start_time).slice(0, 5)} · as usual`,
    skipped: 'No class this week',
    recorded: 'Pre-recorded — students watch the recording',
    moved: change?.movedTo
      ? `Moved to ${new Date(change.movedTo).toLocaleString('en-IE', {
          weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          timeZone: klass.timezone || 'Europe/Dublin',
        })}`
      : 'Moved — needs a new date',
  }[kind];

  return `<li class="date-row is-${kind} ${past ? 'is-past' : ''}" data-date-row="${date}">
    <div class="date-copy">
      <strong>${escapeHtml(day)}</strong>
      <span>${escapeHtml(said)}</span>
    </div>
    ${marks.length ? `<span class="date-mark">${marks.map((mark) => escapeHtml(mark.name)).join(' · ')}</span>` : ''}
    <div class="date-kinds" role="radiogroup" aria-label="What happens on ${escapeHtml(day)}">
      ${[['running', 'On'], ['recorded', 'Recorded'], ['moved', 'Moved'], ['skipped', 'Off']]
        .map(([value, label]) => `<button type="button" class="date-kind ${kind === value ? 'on' : ''}"
          role="radio" aria-checked="${kind === value}" data-date-kind="${value}" data-for="${date}">${label}</button>`).join('')}
    </div>
    ${kind === 'moved' ? `<div class="date-moved">
      <label>New date and time</label>
      <input type="datetime-local" data-date-moved="${date}"
        value="${escapeHtml(change?.movedTo ? toZonedInput(change.movedTo, klass.timezone) : '')}">
    </div>` : ''}
  </li>`;
}

/** Every date the weekly class falls on, between the first and last day. */
function classDatesFor(klass) {
  const dates = [];
  // Stepped at midday UTC so a summer-time boundary cannot skip or repeat one.
  const cursor = new Date(`${String(klass.starts_on).slice(0, 10)}T12:00:00Z`);
  const end = new Date(`${String(klass.ends_on).slice(0, 10)}T12:00:00Z`);
  // Forward to the first sitting on or after the first day.
  const wanted = Number(klass.day_of_week);
  while (((cursor.getUTCDay() + 6) % 7) + 1 !== wanted) cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end && dates.length < 200) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return dates;
}

/** The Monday of the week a date falls in, for looking up what is on that week. */
function mondayOf(date) {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
  return at.toISOString().slice(0, 10);
}


/* An extra sitting, past or future. A cancelled one stays on the list, struck
   through, so it is clear it was called off rather than never entered. */
function sessionRows(sessions = [], timezone = 'Europe/Dublin') {
  if (!sessions.length) return '<p class="muted small">No extra sessions.</p>';
  return `<ul class="session-list">${sessions.map((session) => {
    const when = new Date(session.starts_at);
    const past = when.getTime() < Date.now();
    // The class timezone, so somebody setting this up from abroad is reading
    // the hour their students will turn up at.
    const day = when.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone });
    const time = when.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
    return `<li class="session-row ${session.cancelled ? 'is-cancelled' : ''} ${past ? 'is-past' : ''}"
      data-session-row="${session.id}">
      <div class="session-when">
        <strong>${escapeHtml(day)}</strong>
        <span>${escapeHtml(time)} · ${session.duration_minutes} min</span>
      </div>
      <div class="session-meta">
        ${session.label ? `<span>${escapeHtml(session.label)}</span>` : ''}
        ${session.join_url ? '<span class="pill green">Own link</span>' : ''}
        ${session.cancelled ? '<span class="pill">Cancelled</span>' : ''}
      </div>
      <div class="session-actions">
        <button type="button" class="btn small" data-session-edit="${session.id}">Edit</button>
        ${session.cancelled
          ? `<button type="button" class="btn small" data-session-restore="${session.id}">Restore</button>`
          : `<button type="button" class="btn small" data-session-cancel="${session.id}">Cancel</button>`}
        <button type="button" class="btn small danger" data-session-delete="${session.id}">Delete</button>
      </div>
    </li>`;
  }).join('')}</ul>`;
}

/* Editing one, in the row it is already in.
   ------------------------------------------------------------------
   Class setup is itself a dialog, and opening another over it would replace it —
   the whole panel, with the unsaved link and course ticks in it, gone to change
   a time. So the row turns into the same four fields the add form uses, and
   turns back when it is done. */
function sessionEditRow(session, timezone) {
  /* datetime-local wants the wall clock at the class, not at whoever is looking.
     Built from the parts rather than by slicing an ISO string, which would show
     UTC and quietly move every session by an hour each summer. */
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(session.starts_at))
    .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;

  return `<li class="session-row is-editing" data-session-row="${session.id}">
    <form class="session-form session-edit" data-session-save="${session.id}">
      <div class="form-field"><label>Date and time</label>
        <input name="startsAt" type="datetime-local" value="${escapeHtml(local)}" required></div>
      <div class="form-field"><label>Minutes</label>
        <input name="durationMinutes" type="number" value="${session.duration_minutes}" min="15" max="480"></div>
      <div class="form-field"><label>Label</label>
        <input name="label" maxlength="120" value="${escapeHtml(session.label || '')}" placeholder="Catch-up session"></div>
      <div class="form-field"><label>Link</label>
        <input name="joinUrl" type="url" value="${escapeHtml(session.join_url || '')}" placeholder="Leave empty to use the class link"></div>
      <div class="session-edit-actions">
        <button type="button" class="btn small" data-session-cancel-edit="1">Cancel</button>
        <button type="submit" class="btn small primary">Save</button>
      </div>
    </form>
  </li>`;
}


async function refreshSessions(classId) {
  const setup = await api(`/api/admin/classes/${classId}/setup`);
  state.classSessions = setup.sessions;
  document.getElementById('session-list').innerHTML = sessionRows(setup.sessions, setup.class.timezone);
  bindSessionRows(classId, setup.class.timezone);
}

function bindSessionRows(classId, timezone = 'Europe/Dublin') {
  const list = document.getElementById('session-list');
  if (!list) return;
  const act = async (id, body) => {
    try {
      await api(`/api/admin/classes/${classId}/sessions/${id}`, { method: 'PATCH', body });
      await refreshSessions(classId);
    } catch (error) { showToast(error.message, 'error'); }
  };

  list.querySelectorAll('[data-session-cancel]').forEach((button) =>
    button.addEventListener('click', () => act(button.dataset.sessionCancel, { cancelled: true })));
  list.querySelectorAll('[data-session-restore]').forEach((button) =>
    button.addEventListener('click', () => act(button.dataset.sessionRestore, { cancelled: false })));

  list.querySelectorAll('[data-session-edit]').forEach((button) => button.addEventListener('click', () => {
    const session = (state.classSessions || []).find((row) => row.id === button.dataset.sessionEdit);
    if (!session) return;
    /* One at a time. Two rows open at once is two sets of unsaved changes and no
       way to tell which is which. */
    closeSessionEdits(classId, timezone);
    const row = list.querySelector(`[data-session-row="${session.id}"]`);
    row.outerHTML = sessionEditRow(session, timezone);
    bindSessionEdit(classId, timezone, session.id);
  }));

  list.querySelectorAll('[data-session-delete]').forEach((button) => button.addEventListener('click', async () => {
    const ok = await askConfirm({ title: 'Delete this session?', message: 'Students will no longer see it.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/classes/${classId}/sessions/${button.dataset.sessionDelete}`, { method: 'DELETE' });
      await refreshSessions(classId);
    } catch (error) { showToast(error.message, 'error'); }
  }));
}

/** Put any open editor back to a plain row, discarding what was in it. */
function closeSessionEdits(classId, timezone) {
  const list = document.getElementById('session-list');
  list?.querySelectorAll('.session-row.is-editing').forEach((row) => {
    const session = (state.classSessions || []).find((item) => item.id === row.dataset.sessionRow);
    if (!session) return;
    row.outerHTML = sessionRows([session], timezone)
      .replace('<ul class="session-list">', '').replace('</ul>', '');
  });
  bindSessionRows(classId, timezone);
}

function bindSessionEdit(classId, timezone, sessionId) {
  const form = document.querySelector(`[data-session-save="${sessionId}"]`);
  if (!form) return;

  form.querySelector('[data-session-cancel-edit]').addEventListener('click', () => {
    closeSessionEdits(classId, timezone);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const when = String(data.get('startsAt') || '');
    if (!when) return showToast('Pick a date and time.', 'error');
    try {
      await api(`/api/admin/classes/${classId}/sessions/${sessionId}`, {
        method: 'PATCH',
        body: {
          /* Read as the class's wall clock, not the browser's — the same
             conversion the rest of this screen uses. */
          startsAt: fromZonedInput(when, timezone),
          durationMinutes: Number(data.get('durationMinutes')) || 90,
          label: String(data.get('label') || '').trim(),
          joinUrl: String(data.get('joinUrl') || '').trim(),
        },
      });
      await refreshSessions(classId);
      showToast('Session updated');
    } catch (error) { showToast(error.message, 'error'); }
  });
}

/* Who can run this place.
   ------------------------------------------------------------------
   Behind a super administrator check on the server, because creating an
   administrator hands somebody every other action in the application. An
   ordinary admin account being compromised should stop at what that account
   could already see. */
function adminsView() {
  const rows = state.admins?.admins || [];
  const me = state.admins?.me;
  return `${pageHeader('Administrators', 'Who can run this place',
    'An administrator can do everything on this portal. A super administrator can also create and suspend others.',
    '<button class="btn primary" id="add-admin">Add an administrator</button>')}
    <section class="card table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Last signed in</th><th></th></tr></thead>
        <tbody>${rows.map((row) => `<tr class="${row.active ? '' : 'is-withdrawn'}">
          <td><strong>${escapeHtml(row.name)}</strong>${row.id === me ? ' <span class="pill">You</span>' : ''}</td>
          <td>${escapeHtml(row.email)}</td>
          <td>
            <span class="pill ${row.is_super_admin ? 'green' : ''}">${row.is_super_admin ? 'Super admin' : 'Admin'}</span>
            ${row.active ? '' : '<span class="pill red">Suspended</span>'}
            ${row.must_change_password ? '<span class="pill orange">Invite pending</span>' : ''}
          </td>
          <td class="muted small">${row.last_login_at ? escapeHtml(fmtDate(row.last_login_at, { dateStyle: 'medium' })) : 'Never'}</td>
          <td><div class="row-actions">
            ${row.id === me
              ? '<span class="muted small">You cannot change your own access</span>'
              : `<button class="btn small" data-admin-super="${row.id}" data-on="${row.is_super_admin}">${row.is_super_admin ? 'Make ordinary admin' : 'Make super admin'}</button>
                 <button class="btn small ${row.active ? 'danger' : ''}" data-admin-active="${row.id}" data-on="${row.active}">${row.active ? 'Suspend' : 'Restore'}</button>`}
          </div></td>
        </tr>`).join('')}</tbody>
      </table>
    </section>
    <p class="muted small stack-top">Suspending somebody signs them out everywhere immediately. The last super administrator cannot be suspended or demoted — promote somebody else first, so there is always a way back in.</p>`;
}

function openAdminModal() {
  modal({
    title: 'Add an administrator',
    subtitle: 'They get the same invitation a student does: a temporary password, changed on first sign-in.',
    body: `<form id="admin-form">
      <div class="form-field"><label>Full name</label><input name="name" required></div>
      <div class="form-field"><label>Email</label><input name="email" type="email" required></div>
      <label class="check-row"><input type="checkbox" name="superAdmin"> Also a super administrator</label>
      <p class="muted small">A super administrator can create and suspend other administrators. Leave this off unless they need it.</p>
    </form>`,
    footer: '<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="save-admin">Create and send the invitation</button>',
    onOpen() {
      document.getElementById('save-admin').addEventListener('click', async () => {
        const form = document.getElementById('admin-form');
        const data = new FormData(form);
        try {
          const created = await api('/api/admin/admins', {
            method: 'POST',
            body: {
              name: String(data.get('name') || '').trim(),
              email: String(data.get('email') || '').trim(),
              superAdmin: form.superAdmin.checked,
            },
          });
          closeModal();
          await renderAdmin();
          showToast(created.emailStatus === 'sent'
            ? 'Administrator created and their login emailed'
            : 'Administrator created, but the invitation email failed to send');
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

function attendanceView() {
  return `${pageHeader('Attendance', 'Upload webinar attendance', 'Import a Zoom or webinar CSV for one class and teaching week.')}
    <section class="card" style="max-width:760px"><div class="card-header"><div><h2>Attendance import</h2><p>Students are matched by email first, then by exact name.</p></div></div>
    <form class="card-body" id="attendance-form">
      <div class="form-field"><label>Class</label><select name="classId" id="attendance-class" required>${state.classes.map((klass) => `<option value="${klass.id}">${escapeHtml(classLabel(klass))}</option>`).join('')}</select></div>
      <div class="form-field"><label>Teaching week</label><select name="weekId" id="attendance-week" required><option value="">Choose a class first</option></select></div>
      <div class="form-field"><label>Minutes required for attended live</label><input type="number" name="liveThresholdMinutes" value="30" min="1" required></div>
      <div class="form-field"><label>Attendance CSV</label><input type="file" name="file" accept=".csv,text/csv" required></div>
      <button class="btn primary" type="submit">Import attendance</button>
    </form></section>`;
}

function remindersView() {
  const reminders = state.settings.reminders || {};
  const nudge = state.settings.nudge || {};
  const email = state.settings.email || {};
  const template = (key, title, timing) => {
    const value = reminders[key] || {};
    return `<div class="template-box"><div class="template-head"><div><strong>${title}</strong><div class="muted small">${timing}</div></div><label class="toggle-row"><span class="toggle"><input type="checkbox" data-reminder-enabled="${key}" ${value.enabled !== false ? 'checked' : ''}><span></span></span>Enabled</label></div>
      <div class="form-field"><label>Subject</label><input data-reminder-subject="${key}" value="${escapeHtml(value.subject || '')}"></div>
      <div class="form-field"><label>Email body</label><textarea data-reminder-body="${key}">${escapeHtml(value.body || '')}</textarea></div></div>`;
  };
  return `${pageHeader('Automation', 'Email reminders', 'Configure the delivery provider, templates and automatic deadline sequence.', `<button class="btn" id="run-reminders">Run reminder check</button><button class="btn primary" id="save-reminders">Save settings</button>`)}
    <div class="settings-grid"><div class="settings-stack">
      <section class="card"><div class="card-header"><div><h2>Delivery settings</h2><p>Use a GoHighLevel webhook, SMTP or console mode.</p></div></div><div class="card-body">
        <div class="setting-row"><div class="setting-copy"><strong>Provider</strong><span>Console mode logs email locally without sending.</span></div><div><select id="email-provider"><option value="console" ${email.provider === 'console' ? 'selected' : ''}>Console / test</option><option value="ghl_webhook" ${email.provider === 'ghl_webhook' ? 'selected' : ''}>GoHighLevel webhook</option><option value="smtp" ${email.provider === 'smtp' ? 'selected' : ''}>SMTP</option></select></div></div>
        <div class="setting-row"><div class="setting-copy"><strong>Sender</strong><span>Name, email and reply-to address.</span></div><div><div class="form-field"><input id="email-from-name" value="${escapeHtml(email.fromName || 'Gaeilgeoir Guides')}" placeholder="Sender name"></div><div class="form-field"><input id="email-from-address" type="email" value="${escapeHtml(email.fromAddress || '')}" placeholder="Sender email"></div><div class="form-field"><input id="email-reply-to" type="email" value="${escapeHtml(email.replyTo || '')}" placeholder="Reply-to"></div></div></div>
        <div class="setting-row"><div class="setting-copy"><strong>GoHighLevel webhook</strong><span>Receives the complete email payload.</span></div><div><input id="email-webhook" type="url" value="${escapeHtml(email.webhookUrl || '')}" placeholder="https://..."></div></div>
        <div class="setting-row"><div class="setting-copy"><strong>SMTP</strong><span>Optional direct email delivery. Port 465 normally needs implicit TLS; 587 does not.</span></div><div><div class="form-field"><input id="smtp-host" value="${escapeHtml(email.smtpHost || '')}" placeholder="SMTP host"></div><div class="form-field"><input id="smtp-port" type="number" min="1" max="65535" value="${escapeHtml(String(email.smtpPort || 587))}" placeholder="Port"></div><div class="form-field"><input id="smtp-user" value="${escapeHtml(email.smtpUser || '')}" placeholder="SMTP user"></div><div class="form-field"><input id="smtp-password" type="password" placeholder="Leave blank to keep current password"></div><label class="toggle-row"><span class="toggle"><input id="smtp-secure" type="checkbox" ${email.smtpSecure ? 'checked' : ''}><span></span></span>Use implicit TLS</label></div></div>
      </div><div class="card-footer"><button class="btn" id="test-email">Send test email</button><button class="btn primary" id="save-email">Save email settings</button></div></section>
      <section class="card"><div class="card-header"><div><h2>One-off reminders</h2><p>The wording you start from when you chase a single student from the tracker. Every send is editable first.</p></div></div><div class="card-body">
        <div class="form-field"><label>Missed check-in, subject</label><input id="nudge-checkin-subject" value="${escapeHtml(nudge.checkinSubject || '')}"></div>
        <div class="form-field"><label>Missed check-in, message</label><textarea id="nudge-checkin-body" class="tall">${escapeHtml(nudge.checkinBody || '')}</textarea></div>
        <div class="form-field"><label>Missed homework, subject</label><input id="nudge-homework-subject" value="${escapeHtml(nudge.homeworkSubject || '')}"></div>
        <div class="form-field"><label>Missed homework, message</label><textarea id="nudge-homework-body" class="tall">${escapeHtml(nudge.homeworkBody || '')}</textarea></div>
        <div class="muted small">Available here: <span class="resource-chip">{{first_name}}</span><span class="resource-chip">{{item_title}}</span><span class="resource-chip">{{deadline}}</span><span class="resource-chip">{{link}}</span></div>
      </div><div class="card-footer"><button class="btn primary" id="save-nudge">Save reminder wording</button></div></section>

      <section class="card"><div class="card-header"><div><h2>Automatic deadline sequence</h2><p>Only students who have not submitted receive these.</p></div><label class="toggle-row"><span class="toggle"><input id="reminders-enabled" type="checkbox" ${reminders.enabled !== false ? 'checked' : ''}><span></span></span>Enabled</label></div><div class="card-body">
        ${template('tomorrow', 'Due tomorrow', '24 hours before deadline')}${template('twoHours', 'Due in 2 hours', '2 hours before deadline')}${template('thirtyMinutes', 'Due in 30 minutes', '30 minutes before deadline')}
      </div></section>
    </div><aside class="settings-stack"><section class="card"><div class="card-header"><div><h3>Available variables</h3><p>Use these in subject lines and email bodies.</p></div></div><div class="card-body"><span class="resource-chip">{{first_name}}</span><span class="resource-chip">{{assignment_title}}</span><span class="resource-chip">{{deadline_time}}</span><span class="resource-chip">{{assignment_link}}</span></div></section></aside></div>`;
}

/* Dictation settings mirror the VoiceKey app: which models to use, which language
   to pin, and the personal dictionary that biases both the speech model and the
   cleanup pass toward the terms this course actually uses. */
function dictationSettingsCard() {
  const dictation = state.settings.dictation || {};
  const voicePrompts = state.settings.voicePrompts || {};
  const dictionary = Array.isArray(dictation.dictionary) ? dictation.dictionary : [];
  return `<section class="card"><div class="card-header"><div><h2>Dictation and voice notes</h2><p>Speech is transcribed, then cleaned into the words you would have typed. Same pipeline as VoiceKey.</p></div></div><div class="card-body">
    <div class="setting-row"><div class="setting-copy"><strong>Speech model</strong><span>Used to turn your recording into a transcript.</span></div><div><input id="dictation-transcribe-model" value="${escapeHtml(dictation.transcribeModel || 'gpt-4o-transcribe')}"></div></div>
    <div class="setting-row"><div class="setting-copy"><strong>Cleanup model</strong><span>Turns the raw transcript into finished text.</span></div><div><input id="dictation-cleanup-model" value="${escapeHtml(dictation.cleanupModel || 'gpt-4.1-mini')}"></div></div>
    <div class="setting-row"><div class="setting-copy"><strong>Language</strong><span>Auto handles English with Irish words mixed in, which is what most feedback looks like.</span></div><div><select id="dictation-language">
      <option value="auto" ${(dictation.language || 'auto') === 'auto' ? 'selected' : ''}>Auto detect</option>
      <option value="en" ${dictation.language === 'en' ? 'selected' : ''}>English</option>
      <option value="ga" ${dictation.language === 'ga' ? 'selected' : ''}>Irish</option>
    </select></div></div>
    <div class="setting-row"><div class="setting-copy"><strong>Personal dictionary</strong><span>Names and terms speech recognition tends to mishear. One per line.</span></div><div><textarea id="dictation-dictionary" class="tall">${escapeHtml(dictionary.join('\n'))}</textarea></div></div>
    <div class="form-field"><label>Cleanup instructions</label><textarea id="voice-cleanup-prompt" class="tall">${escapeHtml(voicePrompts.cleanupPrompt || '')}</textarea><div class="muted small">Used for check-in replies, general feedback and student notes.</div></div>
    <div class="form-field"><label>Light cleanup, for Irish corrections</label><textarea id="voice-light-prompt">${escapeHtml(voicePrompts.lightPrompt || '')}</textarea><div class="muted small">Punctuation only. This must never rewrite the Irish being taught.</div></div>
  </div></section>`;
}

function aiSettingsView() {
  const prompts = state.settings.prompts || {};
  const anthropic = state.settings.anthropic || {};
  const openai = state.settings.openai || {};
  return `${pageHeader('Feedback drafting', 'Claude keys and correction prompts', 'AI drafting starts only after a student submits actual work.', `<button class="btn" id="test-anthropic">Test connection</button><button class="btn primary" id="save-ai">Save configuration</button>`)}
    <div class="settings-grid"><div class="settings-stack">
      <section class="card"><div class="card-header"><div><h2>Claude connection</h2><p>Writes the check-in, homework and board drafts. The API key is encrypted server-side and never returned to the browser.</p></div></div><div class="card-body">
        <div class="connection"><span class="connection-dot ${anthropic.configured ? 'ok' : ''}"></span><div><strong>${anthropic.configured ? 'Connected' : 'Not configured'}</strong><span>${anthropic.configured ? `Using ${escapeHtml(anthropic.model)}` : 'Add a server-side API key.'}</span></div></div>
        <div class="setting-row"><div class="setting-copy"><strong>API key</strong><span>Leave blank to keep the existing key.</span></div><div><input id="anthropic-key" type="password" placeholder="sk-ant-..."></div></div>
        <div class="setting-row"><div class="setting-copy"><strong>Model</strong><span>Used for check-in, homework and board drafts.</span></div><div><input id="anthropic-model" value="${escapeHtml(anthropic.model || 'claude-opus-5')}"></div></div>
      </div></section>
      <section class="card"><div class="card-header"><div><h2>Your voice</h2><p>Built into the app, not editable here.</p></div></div><div class="card-body">
        <p class="muted small">The check-in and board drafts are written to a voice measured from 362 replies you sent students on WhatsApp between January and August 2026: how you open, that you never sign off, the length you actually write, no em dashes, and the advice you give over and over. It is held in the code so an edit here cannot undo it.</p>
        <div class="form-field"><label>Notes for this term, weekly check-in</label>
          <textarea id="checkin-notes" placeholder="Optional. Anything true this term, for example how far out the next oral is.">${escapeHtml(prompts.checkinNotes || '')}</textarea>
          <p class="muted small">Added after your voice, not instead of it. Leave empty if there is nothing.</p>
        </div>
        <div class="form-field"><label>Notes for this term, community board</label>
          <textarea id="community-notes" placeholder="Optional.">${escapeHtml(prompts.communityNotes || '')}</textarea>
          <p class="muted small">The draft offered above the reply box when you open a post on the board. It is a starting point you edit, nothing is ever sent without you pressing Comment, and students never see the draft or know one existed.</p>
        </div>
      </div></section>
      <section class="card"><div class="card-header"><div><h2>Homework prompts</h2><p>Corrections are a marking standard, so they stay editable here.</p></div></div><div class="card-body">
        <div class="form-field"><label>Irish corrections, An Caighdeán Oifigiúil</label><textarea id="correction-prompt" class="tall">${escapeHtml(prompts.correctionPrompt || '')}</textarea></div>
        <div class="form-field"><label>General teacher feedback</label><textarea id="general-prompt">${escapeHtml(prompts.generalFeedbackPrompt || '')}</textarea></div>
      </div></section>
      <section class="card"><div class="card-header"><div><h2>OpenAI connection</h2><p>Dictation and transcription only. Claude has no equivalent, so this key stays.</p></div></div><div class="card-body">
        <div class="connection"><span class="connection-dot ${openai.configured ? 'ok' : ''}"></span><div><strong>${openai.configured ? 'Connected' : 'Not configured'}</strong><span>${openai.configured ? `Using ${escapeHtml(openai.model)}` : 'Add a server-side API key.'}</span></div></div>
        <div class="setting-row"><div class="setting-copy"><strong>API key</strong><span>Leave blank to keep the existing key.</span></div><div><input id="openai-key" type="password" placeholder="sk-..."></div></div>
        <div class="setting-row"><div class="setting-copy"><strong>Model</strong><span>Used to tidy up dictated voice notes.</span></div><div><input id="openai-model" value="${escapeHtml(openai.model || 'gpt-5.6')}"></div></div>
      </div></section>
      ${dictationSettingsCard()}
    </div><aside class="settings-stack"><section class="card"><div class="card-header"><div><h3>Draft lifecycle</h3><p>Clear states on the teacher side.</p></div></div><div class="card-body">
      <div class="connection"><span class="connection-dot ok"></span><div><strong>Submission-triggered only</strong><span>No reply is drafted for missing work.</span></div></div>
      <div class="mini-stats"><span class="mini-stat">AI drafted</span><span class="mini-stat">Teacher edited</span><span class="mini-stat">Returned</span></div>
      <p class="muted small"><span class="kbd">←</span> <span class="kbd">→</span> moves through submissions. <span class="kbd">Enter</span> submits feedback. <span class="kbd">Shift</span> + <span class="kbd">Enter</span> adds a line.</p>
    </div></section></aside></div>`;
}

/* Admin bindings and modals */
function bindAdminView() {
  document.getElementById('open-attendance')?.addEventListener('click', () => { state.view = 'attendance'; renderAdmin(); });
  document.getElementById('new-assignment')?.addEventListener('click', () => openAssignmentModal(null, state.activeClassId));
  document.getElementById('import-assignments')?.addEventListener('click', openAssignmentImport);
  document.getElementById('create-assignment')?.addEventListener('click', () => openAssignmentModal());
  document.getElementById('tracker-search')?.addEventListener('input', filterTracker);
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active'); state.filter = button.dataset.filter; filterTracker();
  }));
  document.getElementById('jump-latest')?.addEventListener('click', () => { const scroll = document.getElementById('tracker-scroll'); scroll.scrollTo({ left: scroll.scrollWidth, behavior: 'smooth' }); });
  document.getElementById('engagement-item')?.addEventListener('change', (event) => {
    state.engagementItem = event.target.value;
    // Only the one card changes, so redraw it rather than the whole tracker.
    const card = document.querySelector('.card.engagement');
    if (!card) return renderAdmin();
    card.outerHTML = engagementPanel();
    bindAdminView();
  });
  document.querySelectorAll('[data-review-type]').forEach((button) => button.addEventListener('click', () => openReview(button.dataset)));
  document.querySelectorAll('[data-open-student]').forEach((button) => button.addEventListener('click', () => openStudentProfile(button.dataset.openStudent)));
  document.querySelectorAll('[data-people-tab]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-people-tab]').forEach((item) => item.classList.remove('active')); button.classList.add('active');
    document.getElementById('classes-tab').classList.toggle('hidden', button.dataset.peopleTab !== 'classes');
    document.getElementById('students-tab').classList.toggle('hidden', button.dataset.peopleTab !== 'students');
  }));
  document.getElementById('add-class')?.addEventListener('click', openClassModal);
  document.getElementById('add-admin')?.addEventListener('click', openAdminModal);
  document.querySelectorAll('[data-admin-super]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/api/admin/admins/${button.dataset.adminSuper}`, { method: 'PATCH', body: { superAdmin: button.dataset.on !== 'true' } });
      await renderAdmin();
    } catch (error) { showToast(error.message, 'error'); }
  }));
  document.querySelectorAll('[data-admin-active]').forEach((button) => button.addEventListener('click', async () => {
    const suspending = button.dataset.on === 'true';
    if (suspending && !await askConfirm({
      title: 'Suspend this administrator?',
      message: 'They are signed out everywhere immediately and cannot sign back in. Their work on the portal stays where it is.',
      confirmLabel: 'Suspend', danger: true,
    })) return;
    try {
      await api(`/api/admin/admins/${button.dataset.adminActive}`, { method: 'PATCH', body: { active: !suspending } });
      await renderAdmin();
    } catch (error) { showToast(error.message, 'error'); }
  }));
  document.getElementById('add-student')?.addEventListener('click', openStudentModal);
  document.getElementById('import-students')?.addEventListener('click', openStudentImportModal);
  document.querySelectorAll('[data-open-class]').forEach((button) => button.addEventListener('click', () => { state.activeClassId = button.dataset.openClass; state.view = 'tracker'; renderAdmin(); }));
  document.querySelectorAll('[data-delete-class]').forEach((button) => button.addEventListener('click', () => confirmDeleteClass(button.dataset.deleteClass)));
  document.querySelectorAll('[data-class-link]').forEach((button) => button.addEventListener('click', () => openClassSetupModal(button.dataset.classLink)));
  document.getElementById('community-class')?.addEventListener('change', (event) => {
    state.communityClassId = event.target.value;
    // A category belongs to one class, so carrying the filter across would filter
    // by something the new class has never heard of.
    state.boardCategoryId = null;
    renderAdmin();
  });
  bindFeed();
  document.querySelectorAll('[data-student-class]').forEach((select) => select.addEventListener('change', async () => {
    try { await api(`/api/admin/students/${select.dataset.studentClass}`, { method: 'PATCH', body: { classId: select.value } }); showToast('Student moved'); }
    catch (error) { showToast(error.message, 'error'); }
  }));
  document.querySelectorAll('[data-resend]').forEach((button) => button.addEventListener('click', () => studentAccessAction(button.dataset.resend, 'resend-invite')));
  document.querySelectorAll('[data-reset-student]').forEach((button) => button.addEventListener('click', () => studentAccessAction(button.dataset.resetStudent, 'reset-password')));
  document.querySelectorAll('[data-edit-assignment]').forEach((button) => button.addEventListener('click', () => openAssignmentModal(state.assignments.find((item) => item.id === button.dataset.editAssignment))));
  document.querySelectorAll('[data-reopen-assignment]').forEach((button) => button.addEventListener('click', () => openReopenModal(button.dataset.reopenAssignment)));
  bindAssignmentCalendar();
  bindAttendance();
  bindCheckins();
  bindReminderSettings();
  bindAISettings();
}

function filterTracker() {
  state.trackerSearch = document.getElementById('tracker-search')?.value || '';
  const query = state.trackerSearch.toLowerCase().trim();
  let visible = 0;
  document.querySelectorAll('#tracker-body tr').forEach((row) => {
    const matchesSearch = row.dataset.name.includes(query);
    const matchesFilter = state.filter === 'all' || (state.filter === 'attention' && row.dataset.attention === 'true') || (state.filter === 'missing' && row.dataset.missing === 'true');
    const show = matchesSearch && matchesFilter;
    row.classList.toggle('hidden', !show);
    if (show) visible += 1;
  });
  const note = document.getElementById('tracker-empty-note');
  if (note) {
    note.textContent = visible ? '' : 'No students match this view.';
    note.classList.toggle('hidden', Boolean(visible));
  }
}

async function studentAccessAction(id, action) {
  const ok = await askConfirm(action === 'reset-password'
    ? { title: 'Reset this password?', message: 'A new temporary password is generated and emailed to the student. Their current password stops working and they are signed out everywhere.', confirmLabel: 'Reset and email' }
    : { title: 'Resend the invitation?', message: 'A fresh temporary password is generated and emailed. Their current password stops working and they are signed out everywhere.', confirmLabel: 'Resend invitation' });
  if (!ok) return;
  try { const data = await api(`/api/admin/students/${id}/${action}`, { method: 'POST' }); showToast(data.message || 'Email sent'); }
  catch (error) { showToast(error.message, 'error'); }
}

function openClassModal() {
  modal({
    title: 'Add class', subtitle: 'Creates a separate weekly tracker and assignment stream.',
    body: `<form id="class-form"><div class="form-field"><label>Programme name</label><input name="programmeName" value="Irish for Primary Teaching" required></div><div class="form-field"><label>Day</label><select name="dayOfWeek">${DAY_NAMES.slice(1).map((day, index) => `<option value="${index + 1}">${day}</option>`).join('')}</select></div><div class="form-field"><label>Start time</label><input name="startTime" type="time" value="19:00" required></div><div class="form-field"><label>Timezone</label><input name="timezone" value="Europe/Dublin" required></div>
      <div class="inline-fields">
        <div class="form-field"><label>First day of the course</label><input type="date" name="startsOn"></div>
        <div class="form-field"><label>Last day</label><input type="date" name="endsOn"></div>
      </div>
      <p class="muted small">Weekly check-ins are only created between these dates.</p>
      <label class="check-row"><input type="checkbox" name="hasCommunity" checked> Give this class a community board</label>
      <p class="muted small">Without one, Community never appears in these students’ menu. It can be turned on later.</p>
      ${state.courses?.length ? `<div class="form-field"><label>Courses</label><div class="class-picker">${state.courses.map((course) => `
        <label class="check-row"><input type="checkbox" name="courseIds" value="${course.id}"> ${escapeHtml(course.title)}</label>`).join('')}</div></div>` : ''}
    </form>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="save-class">Add class</button>`,
    onOpen() {
      document.getElementById('save-class').addEventListener('click', async () => {
        const element = document.getElementById('class-form');
        const form = new FormData(element);
        try {
          const klass = await api('/api/admin/classes', {
            method: 'POST',
            body: {
              programmeName: form.get('programmeName'),
              dayOfWeek: form.get('dayOfWeek'),
              startTime: form.get('startTime'),
              timezone: form.get('timezone'),
              hasCommunity: element.hasCommunity.checked,
              startsOn: String(form.get('startsOn') || '') || null,
              endsOn: String(form.get('endsOn') || '') || null,
              courseIds: form.getAll('courseIds'),
            },
          });
          closeModal(); state.classes.push(klass); state.activeClassId = klass.id; state.view = 'tracker'; await renderAdmin(); showToast('Class created');
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

function openStudentModal() {
  modal({
    title: 'Add student', subtitle: 'A strong temporary password will be generated and emailed automatically.',
    body: `<form id="student-form"><div class="form-field"><label>Full name</label><input name="name" required></div><div class="form-field"><label>Email</label><input name="email" type="email" required></div><div class="form-field"><label>Class</label><select name="classId">${state.classes.map((klass) => `<option value="${klass.id}">${escapeHtml(classLabel(klass))}</option>`).join('')}</select></div></form>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="save-student">Create account and send email</button>`,
    onOpen() {
      document.getElementById('save-student').addEventListener('click', async () => {
        const form = Object.fromEntries(new FormData(document.getElementById('student-form')));
        try {
          const result = await api('/api/admin/students', { method: 'POST', body: form });
          closeModal(); await renderAdmin();
          const console_ = state.settings?.email?.provider === 'console' || !state.settings?.email?.provider;
          if (result.emailStatus !== 'sent') showToast('Student created, but the invitation email failed to send. Use Resend invite once email is working.', 'error');
          else if (console_) showToast('Student created. Email is in test mode, so no invitation was actually delivered.', 'error');
          else showToast('Student created and their login emailed');
        }
        catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

function openStudentImportModal() {
  modal({
    title: 'Upload students', subtitle: 'CSV headings: Name, Email and Class. Each new student is emailed a temporary password.',
    body: `<form id="student-import-form"><div class="form-field"><label>Default class, optional</label><select name="classId"><option value="">Use the Class column</option>${state.classes.map((klass) => `<option value="${klass.id}">${escapeHtml(classLabel(klass))}</option>`).join('')}</select></div><div class="form-field"><label>Student CSV</label><input name="file" type="file" accept=".csv,text/csv" required></div></form><div id="import-results"></div>`,
    footer: `<button class="btn" data-close-modal>Close</button><button class="btn primary" id="run-import">Import and invite</button>`,
    onOpen() {
      document.getElementById('run-import').addEventListener('click', async () => {
        const form = new FormData(document.getElementById('student-import-form'));
        try {
          const result = await api('/api/admin/students/import', { method: 'POST', body: form });
          document.getElementById('import-results').innerHTML = `<div class="success-banner">${result.created} of ${result.total} students created.</div><div class="table-wrap"><table class="data-table"><tbody>${result.results.map((row) => `<tr><td>${escapeHtml(row.name || row.email)}</td><td><span class="pill ${row.status === 'created' ? 'green' : 'red'}">${escapeHtml(row.status)}</span></td><td>${escapeHtml(row.error || row.emailStatus || '')}</td></tr>`).join('')}</tbody></table></div>`;
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

function assignmentForm(assignment, defaultClassId, prefillDeadline = null) {
  const questions = assignment?.questions?.length ? assignment.questions : [{ prompt: '', imageUrl: '', required: true }];
  const resources = assignment?.resources || [];
  return `<form id="assignment-form">
    <div class="form-field"><label>Class</label><select name="classId" ${assignment ? 'disabled' : ''}>${state.classes.map((klass) => `<option value="${klass.id}" ${(assignment?.class_id || defaultClassId) === klass.id ? 'selected' : ''}>${escapeHtml(classLabel(klass))}</option>`).join('')}</select></div>
    <div class="form-field"><label>Teaching week, optional</label><select name="weekId" id="assignment-week"><option value="">No weekly tracker column</option></select></div>
    <div class="form-field"><label>Title</label><input name="title" value="${escapeHtml(assignment?.title || '')}" required></div>
    <div class="form-field"><label>Instructions</label><textarea name="instructions">${escapeHtml(assignment?.instructions || '')}</textarea></div>
    <div class="form-field"><label>Loom share or embed URL</label><input name="loomUrl" type="url" value="${escapeHtml(assignment?.loom_url || '')}" placeholder="https://www.loom.com/share/..."></div>
    <div class="form-field"><label>Visible from</label><input name="visibleAt" type="datetime-local" value="${toZonedInput(assignment?.visible_at || new Date())}" required><div class="muted small">Times are ${escapeHtml(classTimezone())} (${escapeHtml(timezoneAbbreviation())}).</div></div>
    <div class="form-field"><label>Deadline</label><input name="deadlineAt" type="datetime-local" value="${assignment?.deadline_at ? toZonedInput(assignment.deadline_at) : (prefillDeadline || toZonedInput(new Date(Date.now() + 7 * 86400000)))}" required></div>
    <div class="form-field"><label>When the deadline passes</label>
      <div class="dl-choice">
        <label class="dl-opt"><input type="radio" name="deadlineKind" value="hard" ${assignment?.hard_deadline !== false ? 'checked' : ''}>
          <span><strong>Hard</strong>The assignment closes. Students see that the deadline has passed and the questions are not shown.</span></label>
        <label class="dl-opt"><input type="radio" name="deadlineKind" value="soft" ${assignment?.hard_deadline === false ? 'checked' : ''}>
          <span><strong>Soft</strong>Students can still hand it in, and the submission is marked late.</span></label>
      </div>
    </div>
    <div class="input-row"><label class="toggle-row"><span class="toggle"><input name="remindersEnabled" type="checkbox" ${assignment?.reminders_enabled !== false ? 'checked' : ''}><span></span></span>Email reminders</label></div>
    ${uploadSettingsBlock(assignment)}
    <div class="section-title">Files students can use</div><div class="form-field"><input id="assignment-files" type="file" multiple></div><div id="resource-list">${resources.map((resource) => `<span class="resource-chip" data-existing-resource='${escapeHtml(JSON.stringify({ fileName: resource.fileName || resource.filename, fileUrl: resource.fileUrl || resource.fileurl, mimeType: resource.mimeType || resource.mimetype || '' }))}'>${escapeHtml(resource.fileName || resource.filename)}</span>`).join('')}</div>
    <div class="section-title">Rolling questions</div><div id="question-list">${questions.map((question, index) => questionBuilder(question, index)).join('')}</div><button class="btn small" type="button" id="add-question">Add question</button>
  </form>`;
}

const FILE_TYPE_CHOICES = [
  { value: 'image', label: 'Photos and images', hint: 'A photo or scan of handwritten work' },
  { value: 'pdf', label: 'PDF', hint: 'Scans and exported documents' },
  { value: 'word', label: 'Word documents', hint: '.docx from Word, Pages or Google Docs' },
  { value: 'text', label: 'Plain text', hint: '.txt files' },
];

/* Whether this assignment takes files at all, and which ones. Anything uploaded
   is read into text on arrival, so a photo of handwriting still goes through the
   Irish corrections the same as typed work. */
function uploadSettingsBlock(assignment) {
  const allowed = assignment?.accepted_file_types || ['image', 'pdf'];
  const on = Boolean(assignment?.allow_uploads);
  return `<div class="upload-settings ${on ? 'is-on' : ''}" id="upload-settings">
    <label class="toggle-row"><span class="toggle"><input name="allowUploads" type="checkbox" ${on ? 'checked' : ''}><span></span></span>Let students upload files with this homework</label>
    <div class="upload-settings-body" ${on ? '' : 'hidden'}>
      <p class="muted small">Uploads are read into text automatically, so a photo of handwritten Irish goes through the same corrections as anything typed in.</p>
      <div class="file-type-grid">${FILE_TYPE_CHOICES.map((choice) => `
        <label class="file-type"><input type="checkbox" data-file-type="${choice.value}" ${allowed.includes(choice.value) ? 'checked' : ''}>
          <span><strong>${escapeHtml(choice.label)}</strong><small>${escapeHtml(choice.hint)}</small></span></label>`).join('')}</div>
      <div class="upload-settings-row">
        <label class="toggle-row"><span class="toggle"><input name="uploadsRequired" type="checkbox" ${assignment?.uploads_required ? 'checked' : ''}><span></span></span>A file must be uploaded to submit</label>
        <label class="inline-number">Up to <input name="maxFiles" type="number" min="1" max="10" value="${Number(assignment?.max_files || 3)}"> file(s)</label>
      </div>
    </div>
  </div>`;
}

function questionBuilder(question, index) {
  return `<div class="question-builder" data-question><div class="question-builder-head"><strong>Question <span data-question-number>${index + 1}</span></strong><button type="button" class="text-link" data-remove-question>Remove</button></div><div class="form-field"><label>Question</label><textarea data-question-prompt required>${escapeHtml(question.prompt || '')}</textarea></div><div class="form-field"><label>Embedded image, optional</label><input data-question-image type="url" value="${escapeHtml(question.imageUrl || question.image_url || '')}" placeholder="Existing image URL"><input data-question-image-file type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="margin-top:7px"></div><label class="toggle-row"><span class="toggle"><input data-question-required type="checkbox" ${question.required !== false ? 'checked' : ''}><span></span></span>Required</label></div>`;
}


async function loadAssignmentWeeks(classId, selected = '') {
  if (!classId) return;
  const tracker = await api(`/api/admin/tracker/${classId}`);
  const select = document.getElementById('assignment-week');
  select.innerHTML = `<option value="">No weekly tracker column</option>${tracker.weeks.map((week) => `<option value="${week.id}" ${selected === week.id ? 'selected' : ''}>Week of ${fmtWeek(week.week_start)}</option>`).join('')}`;
}

/* A term of homework from a spreadsheet.
   ------------------------------------------------------------------
   The same shape as the scheduled posts import, for the same reason: the
   planning already exists as a document, and building twelve assignments
   through the form is the work this removes. One row per assignment, questions
   in numbered columns, and nothing written until the file has been read back.
*/
function openAssignmentImport() {
  const classes = state.classes || [];
  const chosen = () => document.getElementById('import-class')?.value || classes[0]?.id;

  modal({
    title: 'Import homework',
    subtitle: 'One row per assignment. Nothing is written until you have seen what it read.',
    wide: true,
    body: `<div class="form-field"><label>Which class</label>
        <select class="select" id="import-class">${classes.map((row) => `<option value="${row.id}">${escapeHtml(classLabel(row))}</option>`).join('')}</select>
      </div>
      <label class="fu-zone" id="hw-zone">
        <input class="fu-input" type="file" id="hw-input" accept=".csv,text/csv">
        <span class="fu-icon">${svg.cloudUp}</span>
        <span class="fu-lead"><b>Click to upload</b> or drag a CSV here</span>
        <span class="fu-hint">Deadline, Title, Instructions, Opens, Deadline type, Q1, Q2, Q3…</span>
      </label>
      <p class="muted small">Put each question in its own column — <b>Q1</b>, <b>Q2</b>, <b>Q3</b>, as many as you need.
        Dates read as ${escapeHtml(classTimezone())} and can be written 25/12/2026 20:00 or 2026-12-25T20:00.
        Each assignment is filed against the teaching week its deadline falls in.
        <button type="button" class="text-link" id="hw-template">Download the template</button>.</p>
      <div id="hw-preview"></div>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="hw-import" disabled>Import</button>`,
    onOpen() {
      const input = document.getElementById('hw-input');
      const zone = document.getElementById('hw-zone');
      const preview = document.getElementById('hw-preview');
      const importButton = document.getElementById('hw-import');
      let chosenFile = null;

      document.getElementById('hw-template').addEventListener('click', async () => {
        try {
          const response = await fetch(`/api/admin/classes/${chosen()}/assignment-template`, { credentials: 'same-origin' });
          if (!response.ok) throw new Error('The template could not be prepared.');
          const url = URL.createObjectURL(new Blob([await response.text()], { type: 'text/csv;charset=utf-8' }));
          const link = document.createElement('a');
          link.href = url; link.download = 'assignments-template.csv';
          document.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        } catch (error) { showToast(error.message, 'error'); }
      });

      const read = async (file) => {
        if (!file) return;
        chosenFile = file;
        preview.innerHTML = '<p class="muted small">Reading…</p>';
        importButton.disabled = true;
        const form = new FormData();
        form.append('file', file);
        let result;
        try { result = await api(`/api/admin/classes/${chosen()}/assignment-preview`, { method: 'POST', body: form }); }
        catch (error) { preview.innerHTML = `<p class="csv-bad">${escapeHtml(error.message)}</p>`; return; }
        preview.innerHTML = assignmentPreview(result);
        importButton.disabled = result.ready === 0;
        importButton.textContent = result.ready
          ? `Create ${result.ready} assignment${result.ready === 1 ? '' : 's'}`
          : 'Nothing to import';
      };

      input.addEventListener('change', () => read(input.files?.[0]));
      // Changing the class re-reads the file: the weeks it is filed against differ.
      document.getElementById('import-class').addEventListener('change', () => read(chosenFile));
      ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (event) => {
        event.preventDefault(); zone.classList.add('is-over');
      }));
      ['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, () => zone.classList.remove('is-over')));
      zone.addEventListener('drop', (event) => { event.preventDefault(); read(event.dataTransfer?.files?.[0]); });

      importButton.addEventListener('click', async () => {
        if (!chosenFile) return;
        const form = new FormData();
        form.append('file', chosenFile);
        importButton.disabled = true;
        try {
          const result = await api(`/api/admin/classes/${chosen()}/assignment-import`, { method: 'POST', body: form });
          closeModal();
          state.assignments = await api('/api/admin/assignments');
          renderAdmin();
          showToast(`${result.created} assignment${result.created === 1 ? '' : 's'} created${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}`);
        } catch (error) { importButton.disabled = false; showToast(error.message, 'error'); }
      });
    },
  });
}

/* Every row, in file order, with its problems named — a count alone leaves
   somebody guessing which nine of their twelve made it. */
function assignmentPreview(result) {
  return `<div class="csv-summary">
      <span class="csv-ok">${result.ready} ready</span>
      ${result.problems ? `<span class="csv-bad">${result.problems} with problems</span>` : ''}
      <span class="muted small">Times read as ${escapeHtml(result.timezone)}</span>
    </div>
    <div class="table-wrap"><table class="data-table compact">
      <thead><tr><th>Row</th><th>Title</th><th>Deadline</th><th>Questions</th><th>Week</th><th></th></tr></thead>
      <tbody>${result.rows.map((row) => `<tr class="${row.problems.length ? 'is-bad' : ''}">
        <td>${row.line}</td>
        <td>${escapeHtml(row.title || '—')}${row.hardDeadline ? '' : ' <span class="pill">Soft</span>'}</td>
        <td>${escapeHtml(row.localDeadline || '—')}${row.past && !row.problems.length ? '<b class="csv-note">already passed</b>' : ''}</td>
        <td>${row.questions.length}</td>
        <td>${row.weekLabel ? escapeHtml(fmtWeek(row.weekLabel)) : '<span class="muted small">no matching week</span>'}</td>
        <td>${row.problems.length
          ? `<span class="csv-bad">${escapeHtml(row.problems.join('; '))}</span>`
          : '<span class="csv-ok">will be created</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

function openAssignmentModal(assignment = null, defaultClassId = null, prefillDeadline = null) {
  modal({
    title: assignment ? 'Edit assignment' : 'Create assignment', subtitle: 'Students complete multiple questions one at a time. Drafts save automatically.', wide: true,
    body: assignmentForm(assignment, defaultClassId, prefillDeadline),
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="save-assignment">${assignment ? 'Save changes' : 'Publish assignment'}</button>`,
    onOpen() {
      const form = document.getElementById('assignment-form');
      loadAssignmentWeeks(assignment?.class_id || defaultClassId || form.classId.value, assignment?.week_id || '');
      form.classId?.addEventListener('change', () => loadAssignmentWeeks(form.classId.value));
      document.getElementById('add-question').addEventListener('click', () => {
        document.getElementById('question-list').insertAdjacentHTML('beforeend', questionBuilder({}, document.querySelectorAll('[data-question]').length));
        bindQuestionRemoval();
      });
      bindQuestionRemoval();
      const uploadToggle = form.allowUploads;
      const uploadBody = document.querySelector('.upload-settings-body');
      uploadToggle.addEventListener('change', () => {
        uploadBody.hidden = !uploadToggle.checked;
        document.getElementById('upload-settings').classList.toggle('is-on', uploadToggle.checked);
      });
      document.getElementById('save-assignment').addEventListener('click', async () => {
        try {
          const filesInput = document.getElementById('assignment-files');
          const resources = [...document.querySelectorAll('[data-existing-resource]')].map((element) => JSON.parse(element.dataset.existingResource));
          if (filesInput.files.length) {
            const upload = new FormData();
            [...filesInput.files].forEach((file) => upload.append('files', file));
            const uploaded = await api('/api/admin/uploads', { method: 'POST', body: upload });
            resources.push(...uploaded.files);
          }
          const fd = new FormData(form);
          const questionElements = [...document.querySelectorAll('[data-question]')];
          const questions = [];
          for (const element of questionElements) {
            let imageUrl = element.querySelector('[data-question-image]').value || null;
            const imageFile = element.querySelector('[data-question-image-file]').files[0];
            if (imageFile) {
              const imageUpload = new FormData();
              imageUpload.append('files', imageFile);
              const uploadedImage = await api('/api/admin/uploads', { method: 'POST', body: imageUpload });
              imageUrl = uploadedImage.files[0]?.url || imageUrl;
            }
            questions.push({
              prompt: element.querySelector('[data-question-prompt]').value,
              imageUrl,
              required: element.querySelector('[data-question-required]').checked,
            });
          }
          const payload = {
            classId: assignment?.class_id || fd.get('classId'), weekId: fd.get('weekId') || null,
            title: fd.get('title'), instructions: fd.get('instructions'), loomUrl: fd.get('loomUrl') || null,
            visibleAt: fromZonedInput(fd.get('visibleAt')), deadlineAt: fromZonedInput(fd.get('deadlineAt')),
            hardDeadline: form.deadlineKind.value === 'hard', remindersEnabled: form.remindersEnabled.checked,
            allowUploads: form.allowUploads.checked,
            uploadsRequired: form.uploadsRequired.checked,
            acceptedFileTypes: [...document.querySelectorAll('[data-file-type]:checked')].map((box) => box.dataset.fileType),
            maxFiles: Number(form.maxFiles.value) || 3,
            status: assignment?.status || 'published', questions, resources,
          };
          await api(assignment ? `/api/admin/assignments/${assignment.id}` : '/api/admin/assignments', { method: assignment ? 'PUT' : 'POST', body: payload });
          closeModal(); await renderAdmin(); showToast(assignment ? 'Assignment updated' : 'Assignment published');
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

function bindQuestionRemoval() {
  document.querySelectorAll('[data-remove-question]').forEach((button) => {
    button.onclick = () => {
      if (document.querySelectorAll('[data-question]').length <= 1) return showToast('At least one question is required', 'error');
      button.closest('[data-question]').remove();
      document.querySelectorAll('[data-question-number]').forEach((element, index) => { element.textContent = index + 1; });
    };
  });
}

function bindAssignmentCalendar() {
  document.querySelectorAll('[data-assignment-view]').forEach((button) => button.addEventListener('click', async () => {
    state.assignmentView = button.dataset.assignmentView;
    await renderAdmin();
  }));
  document.querySelectorAll('[data-assignment-step]').forEach((button) => button.addEventListener('click', async () => {
    const step = Number(button.dataset.assignmentStep);
    if (!step) state.assignmentMonth = null;
    else {
      const cursor = state.assignmentMonth ? new Date(state.assignmentMonth) : new Date();
      state.assignmentMonth = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1).toISOString();
    }
    await renderAdmin();
  }));
  document.getElementById('assignment-class-filter')?.addEventListener('change', async (event) => {
    state.assignmentClassId = event.target.value || null;
    await renderAdmin();
  });
  document.getElementById('show-archived')?.addEventListener('change', async (event) => {
    state.showArchived = event.target.checked;
    await renderAdmin();
  });
  // Clicking a day opens the create form with that deadline already filled in.
  document.querySelectorAll('[data-add-on]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    openAssignmentModal(null, state.assignmentClassId, `${button.dataset.addOn}T18:00`);
  }));
  document.querySelectorAll('[data-archive-assignment]').forEach((button) => button.addEventListener('click', async () => {
    const archived = button.dataset.archived === 'true';
    try {
      await api(`/api/admin/assignments/${button.dataset.archiveAssignment}/archive`, { method: 'POST', body: { archived: !archived } });
      await renderAdmin();
      showToast(archived ? 'Assignment restored' : 'Assignment archived');
    } catch (error) { showToast(error.message, 'error'); }
  }));
  document.querySelectorAll('[data-delete-assignment]').forEach((button) => button.addEventListener('click', () => confirmDeleteAssignment(button.dataset.deleteAssignment)));
  document.getElementById('calendar-subscribe')?.addEventListener('click', openCalendarSubscribeModal);
}

/* Deleting takes the students' work with it, so the count comes first and archive
   is offered as the thing you probably meant. */
async function confirmDeleteAssignment(id) {
  let impact;
  try { impact = await api(`/api/admin/assignments/${id}/impact`); }
  catch (error) { return showToast(error.message, 'error'); }

  const { submissions, returned, drafts, assignment } = impact;
  const detail = submissions
    ? `<div class="error-banner"><strong>${submissions} student submission${submissions === 1 ? '' : 's'} will be deleted permanently.</strong>${returned ? ` ${returned} of ${returned === 1 ? 'them has' : 'them have'} already had feedback returned.` : ''}</div>
       <p class="muted small">Archiving keeps the work and the feedback, and removes the assignment from the tracker and from what students see. That is usually what you want.</p>`
    : `<p class="muted small">Nothing has been submitted${drafts ? `, though ${drafts} student${drafts === 1 ? ' has' : 's have'} an unfinished draft` : ''}. This assignment can be deleted cleanly.</p>`;

  modal({
    title: `Delete “${assignment.title}”?`,
    subtitle: 'This cannot be undone.',
    body: detail,
    footer: `<button class="btn" data-close-modal>Cancel</button>
      ${submissions ? `<button class="btn" id="archive-instead">Archive instead</button>` : ''}
      <button class="btn danger" id="confirm-delete">Delete${submissions ? ` and remove ${submissions} submission${submissions === 1 ? '' : 's'}` : ''}</button>`,
    onOpen() {
      document.getElementById('archive-instead')?.addEventListener('click', async () => {
        try {
          await api(`/api/admin/assignments/${id}/archive`, { method: 'POST', body: { archived: true } });
          closeModal(); await renderAdmin(); showToast('Assignment archived, submissions kept');
        } catch (error) { showToast(error.message, 'error'); }
      });
      document.getElementById('confirm-delete').addEventListener('click', async () => {
        try {
          await api(`/api/admin/assignments/${id}?confirmSubmissions=${submissions}`, { method: 'DELETE' });
          closeModal(); await renderAdmin(); showToast('Assignment deleted');
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

/* Subscribing beats downloading: the calendar app re-reads the feed, so a moved
   deadline or a new assignment turns up without anyone adding it again. */
async function openCalendarSubscribeModal() {
  let feed;
  try { feed = await api('/api/admin/calendar-feed'); }
  catch (error) { return showToast(error.message, 'error'); }

  const webcal = feed.url.replace(/^https?:/, 'webcal:');
  modal({
    title: 'Add deadlines to your calendar',
    subtitle: 'Subscribe once and it stays up to date on its own.',
    body: `
      <p class="muted small">This link is private to you. Anyone who has it can read your deadlines, so treat it like a password.</p>
      <div class="form-field"><label for="feed-url">Your calendar link</label><input id="feed-url" readonly value="${escapeHtml(feed.url)}"></div>
      <div class="actions"><button class="btn" id="copy-feed">Copy link</button><a class="btn primary" href="${escapeHtml(webcal)}">Open in your calendar app</a></div>
      <div class="section-title">How to add it</div>
      <ul class="how-to">
        <li><strong>iPhone or Mac:</strong> tap <em>Open in your calendar app</em>, or Calendar → File → New Calendar Subscription and paste the link.</li>
        <li><strong>Google Calendar:</strong> Other calendars → From URL → paste the link.</li>
        <li><strong>Outlook:</strong> Add calendar → Subscribe from web → paste the link.</li>
      </ul>
      <p class="muted small">Calendar apps refresh on their own schedule, often only every few hours. The feed carries every published deadline across your classes.</p>`,
    footer: `<button class="btn danger" id="rotate-feed">Reset link</button><button class="btn primary" data-close-modal>Done</button>`,
    onOpen() {
      document.getElementById('copy-feed').addEventListener('click', async () => {
        const input = document.getElementById('feed-url');
        try { await navigator.clipboard.writeText(input.value); showToast('Link copied'); }
        catch { input.select(); showToast('Press Cmd+C to copy'); }
      });
      document.getElementById('rotate-feed').addEventListener('click', async () => {
        if (!await askConfirm({ title: 'Reset your calendar link?', message: 'Any calendar already subscribed stops updating until you add the new link. Use this if you think someone else has the old one.', confirmLabel: 'Reset link', danger: true })) return;
        try {
          const next = await api('/api/admin/calendar-feed/rotate', { method: 'POST' });
          document.getElementById('feed-url').value = next.url;
          showToast('Link reset. Re-add it in your calendar app.');
        } catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

function openReopenModal(id) {
  modal({
    title: 'Reopen assignment', subtitle: 'Set a new closing time for students who still need to submit.',
    body: `<div class="form-field"><label>Reopen until</label><input id="reopen-until" type="datetime-local" value="${toZonedInput(new Date(Date.now() + 2 * 86400000))}"><div class="muted small">Times are ${escapeHtml(classTimezone())} (${escapeHtml(timezoneAbbreviation())}).</div></div>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="confirm-reopen">Reopen assignment</button>`,
    onOpen() {
      document.getElementById('confirm-reopen').addEventListener('click', async () => {
        try { await api(`/api/admin/assignments/${id}/reopen`, { method: 'POST', body: { reopenedUntil: fromZonedInput(document.getElementById('reopen-until').value) } }); closeModal(); await renderAdmin(); showToast('Assignment reopened'); }
        catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

function bindAttendance() {
  const classSelect = document.getElementById('attendance-class');
  if (!classSelect) return;
  const loadWeeks = async () => {
    const data = await api(`/api/admin/tracker/${classSelect.value}`);
    document.getElementById('attendance-week').innerHTML = data.weeks.map((week) => `<option value="${week.id}">Week of ${fmtWeek(week.week_start)}</option>`).join('');
  };
  classSelect.addEventListener('change', loadWeeks); loadWeeks();
  document.getElementById('attendance-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/api/admin/attendance/import', { method: 'POST', body: new FormData(event.currentTarget) });
      modal({ title: 'Attendance imported', subtitle: `${result.rows.filter((row) => row.matched).length} students matched`, body: `<div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Status</th><th>Minutes</th></tr></thead><tbody>${result.rows.map((row) => `<tr><td>${escapeHtml(row.name || row.email || 'Unknown')}</td><td><span class="pill ${row.matched ? 'green' : 'red'}">${row.matched ? escapeHtml(row.status) : 'Unmatched'}</span></td><td>${row.minutes ?? '—'}</td></tr>`).join('')}</tbody></table></div>`, footer: `<button class="btn primary" data-close-modal>Done</button>` });
    } catch (error) { showToast(error.message, 'error'); }
  });
}

function bindReminderSettings() {
  document.getElementById('save-reminders')?.addEventListener('click', saveReminders);
  document.getElementById('save-nudge')?.addEventListener('click', async () => {
    try {
      await api('/api/settings/nudge', { method: 'PUT', body: {
        checkinSubject: document.getElementById('nudge-checkin-subject').value,
        checkinBody: document.getElementById('nudge-checkin-body').value,
        homeworkSubject: document.getElementById('nudge-homework-subject').value,
        homeworkBody: document.getElementById('nudge-homework-body').value,
      } });
      showToast('Reminder wording saved');
    } catch (error) { showToast(error.message, 'error'); }
  });
  document.getElementById('save-email')?.addEventListener('click', saveEmailSettings);
  document.getElementById('test-email')?.addEventListener('click', testEmail);
  document.getElementById('run-reminders')?.addEventListener('click', async () => {
    try { await api('/api/admin/reminders/run', { method: 'POST' }); showToast('Reminder cycle completed'); }
    catch (error) { showToast(error.message, 'error'); }
  });
}

async function saveReminders() {
  const data = { enabled: document.getElementById('reminders-enabled').checked };
  ['tomorrow', 'twoHours', 'thirtyMinutes'].forEach((key) => {
    data[key] = { enabled: document.querySelector(`[data-reminder-enabled="${key}"]`).checked, subject: document.querySelector(`[data-reminder-subject="${key}"]`).value, body: document.querySelector(`[data-reminder-body="${key}"]`).value };
  });
  try { await api('/api/settings/reminders', { method: 'PUT', body: data }); showToast('Reminder sequence saved'); }
  catch (error) { showToast(error.message, 'error'); }
}

async function saveEmailSettings() {
  const data = {
    provider: document.getElementById('email-provider').value, fromName: document.getElementById('email-from-name').value,
    fromAddress: document.getElementById('email-from-address').value, replyTo: document.getElementById('email-reply-to').value,
    webhookUrl: document.getElementById('email-webhook').value, smtpHost: document.getElementById('smtp-host').value,
    smtpPort: Number(document.getElementById('smtp-port').value) || 587,
    smtpSecure: document.getElementById('smtp-secure').checked,
    smtpUser: document.getElementById('smtp-user').value, smtpPassword: document.getElementById('smtp-password').value,
  };
  try { await api('/api/settings/email', { method: 'PUT', body: data }); showToast('Email settings saved'); }
  catch (error) { showToast(error.message, 'error'); }
}

function testEmail() {
  modal({
    title: 'Send test email', body: `<div class="form-field"><label>Recipient</label><input id="test-email-address" type="email" value="${escapeHtml(state.user.email)}"></div>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="send-test-email">Send test</button>`,
    onOpen() {
      document.getElementById('send-test-email').addEventListener('click', async () => {
        try { await api('/api/settings/email/test', { method: 'POST', body: { to: document.getElementById('test-email-address').value } }); closeModal(); showToast('Test email sent'); }
        catch (error) { showToast(error.message, 'error'); }
      });
    },
  });
}

function bindAISettings() {
  document.getElementById('save-ai')?.addEventListener('click', async () => {
    try {
      await api('/api/settings/anthropic', { method: 'PUT', body: { apiKey: document.getElementById('anthropic-key').value || undefined, model: document.getElementById('anthropic-model').value } });
      await api('/api/settings/openai', { method: 'PUT', body: { apiKey: document.getElementById('openai-key').value || undefined, model: document.getElementById('openai-model').value } });
      await api('/api/settings/prompts', { method: 'PUT', body: { correctionPrompt: document.getElementById('correction-prompt').value, generalFeedbackPrompt: document.getElementById('general-prompt').value, checkinNotes: document.getElementById('checkin-notes').value, communityNotes: document.getElementById('community-notes').value } });
      await api('/api/settings/dictation', { method: 'PUT', body: {
        transcribeModel: document.getElementById('dictation-transcribe-model').value,
        cleanupModel: document.getElementById('dictation-cleanup-model').value,
        language: document.getElementById('dictation-language').value,
        dictionary: document.getElementById('dictation-dictionary').value.split('\n').map((line) => line.trim()).filter(Boolean),
        cleanupPrompt: document.getElementById('voice-cleanup-prompt').value,
        lightPrompt: document.getElementById('voice-light-prompt').value,
      } });
      showToast('Drafting configuration saved'); await renderAdmin();
    } catch (error) { showToast(error.message, 'error'); }
  });
  /* Drafts a real check-in from an invented student rather than pinging the API,
     because the thing worth testing is whether it sounds like you. */
  document.getElementById('test-anthropic')?.addEventListener('click', async () => {
    try { const result = await api('/api/settings/anthropic/test', { method: 'POST' }); modal({ title: 'Claude connection successful', body: `<div class="feedback-box"><h3>Draft preview</h3><p>${escapeHtml(result.preview).replace(/\n/g, '<br>')}</p></div>`, footer: `<button class="btn primary" data-close-modal>Done</button>` }); }
    catch (error) { showToast(error.message, 'error'); }
  });
}

/* ------------------------------------------------------------------
   Student profile: the record of one student, plus the private notes an
   administrator keeps about them. Students never see any of this.
   ------------------------------------------------------------------ */
async function openStudentProfile(studentId) {
  try {
    const data = await api(`/api/admin/students/${studentId}/profile`);
    state.profile = data;
    renderStudentProfile();
  } catch (error) { showToast(error.message, 'error'); }
}

function renderStudentProfile() {
  const { student, notes, stats } = state.profile;
  const attendanceRate = stats?.recorded_weeks ? Math.round((stats.live_weeks / stats.recorded_weeks) * 100) : null;
  openDrawer({
    title: student.name,
    subtitle: `${student.email}${student.classLabel ? ` · ${student.classLabel}` : ''}`,
    body: `
      <div class="detail-grid">
        <div class="detail"><small>Live attendance</small><strong>${attendanceRate === null ? 'No records yet' : `${attendanceRate}% of ${stats.recorded_weeks} weeks`}</strong></div>
        <div class="detail"><small>Check-ins submitted</small><strong>${stats?.checkins_submitted ?? 0}</strong></div>
        <div class="detail"><small>Homework submitted</small><strong>${stats?.homework_submitted ?? 0}</strong></div>
        <div class="detail"><small>Average understanding</small><strong>${stats?.avg_understanding ? `${stats.avg_understanding}/10` : '—'}</strong></div>
        <div class="detail"><small>Average confidence</small><strong>${stats?.avg_confidence ? `${stats.avg_confidence}/10` : '—'}</strong></div>
        <div class="detail"><small>Last login</small><strong>${student.last_login_at ? escapeHtml(fmtDate(student.last_login_at, { time: true })) : 'Never signed in'}</strong></div>
      </div>

      ${state.profile.withdrawal ? withdrawalSummary(state.profile.withdrawal) : ''}

      <div class="section-title">Add a note</div>
      <div class="form-field">
        <div class="input-row"><label for="new-note">Private to the Gaeilgeoir Guides team</label>${dictateButton('new-note')}</div>
        <textarea id="new-note" placeholder="A phone call, a reason for an absence, something to follow up on."></textarea>
      </div>
      <div class="note-compose">
        <label class="toggle-row"><span class="toggle"><input id="new-note-pinned" type="checkbox"><span></span></span>Pin to the top</label>
        <button class="btn primary small" id="save-note">Save note</button>
      </div>

      <div class="section-title">Notes${notes.length ? ` (${notes.length})` : ''}</div>
      <div id="note-list">${notes.length ? notes.map(noteCard).join('') : '<div class="empty-state"><h3>No notes yet</h3><p>Anything you log here stays private to your team.</p></div>'}</div>`,
    footer: `<div class="muted small">${svg.lock} Never visible to the student</div><div class="actions"><button class="btn" data-close-drawer>Close</button></div>`,
    onOpen: bindStudentProfile,
  });
}

function withdrawalSummary(row) {
  const rating = (value) => (value ? `${value}/5` : '—');
  return `<div class="withdrawal-card">
    <header><strong>Withdrew from the course</strong><span>${escapeHtml(fmtDate(row.submitted_at, { time: true, weekday: true, dateStyle: 'short' }))}</span></header>
    <p class="withdrawal-reason">${escapeHtml(row.reason)}</p>
    ${row.detail ? `<p>${escapeHtml(row.detail)}</p>` : ''}
    <div class="withdrawal-ratings">
      <span>Overall <strong>${rating(row.overall_rating)}</strong></span>
      <span>Teaching <strong>${rating(row.teaching_rating)}</strong></span>
      <span>Materials <strong>${rating(row.materials_rating)}</strong></span>
      ${row.pace ? `<span>Pace <strong>${escapeHtml(row.pace)}</strong></span>` : ''}
      ${row.would_recommend ? `<span>Would recommend <strong>${escapeHtml(row.would_recommend)}</strong></span>` : ''}
    </div>
    ${row.what_worked ? `<div class="withdrawal-answer"><small>What worked</small><p>${escapeHtml(row.what_worked)}</p></div>` : ''}
    ${row.what_to_improve ? `<div class="withdrawal-answer"><small>What to change</small><p>${escapeHtml(row.what_to_improve)}</p></div>` : ''}
    <div class="muted small">${row.may_contact ? 'Happy to be contacted about these answers.' : 'Did not want to be contacted about these answers.'}</div>
  </div>`;
}

function noteCard(note) {
  return `<article class="note-card ${note.pinned ? 'is-pinned' : ''}" data-note-id="${note.id}">
    <header><span>${escapeHtml(note.author_name || 'Gaeilgeoir Guides')} · ${escapeHtml(fmtDate(note.created_at, { time: true, weekday: true, dateStyle: 'short' }))}${note.pinned ? ' · Pinned' : ''}</span>
      <span class="row-actions"><button class="text-link" data-pin-note="${note.id}">${note.pinned ? 'Unpin' : 'Pin'}</button><button class="text-link" data-delete-note="${note.id}">Delete</button></span>
    </header>
    <p>${escapeHtml(note.body)}</p>
  </article>`;
}

function bindStudentProfile() {
  bindDictation(modalRoot);
  document.getElementById('save-note')?.addEventListener('click', async () => {
    const body = document.getElementById('new-note').value.trim();
    if (!body) return showToast('Write a note first', 'error');
    try {
      const note = await api(`/api/admin/students/${state.profile.student.id}/notes`, {
        method: 'POST',
        body: { body, pinned: document.getElementById('new-note-pinned').checked },
      });
      state.profile.notes.unshift(note);
      state.profile.notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.created_at) - new Date(a.created_at));
      renderStudentProfile();
      showToast('Note saved');
    } catch (error) { showToast(error.message, 'error'); }
  });
  document.querySelectorAll('[data-pin-note]').forEach((button) => button.addEventListener('click', async () => {
    const note = state.profile.notes.find((item) => item.id === button.dataset.pinNote);
    try {
      const updated = await api(`/api/admin/notes/${note.id}`, { method: 'PATCH', body: { pinned: !note.pinned } });
      Object.assign(note, updated);
      state.profile.notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.created_at) - new Date(a.created_at));
      renderStudentProfile();
    } catch (error) { showToast(error.message, 'error'); }
  }));
  document.querySelectorAll('[data-delete-note]').forEach((button) => button.addEventListener('click', async () => {
    if (!await askConfirm({ title: 'Delete this note?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) return;
    try {
      await api(`/api/admin/notes/${button.dataset.deleteNote}`, { method: 'DELETE' });
      state.profile.notes = state.profile.notes.filter((item) => item.id !== button.dataset.deleteNote);
      renderStudentProfile();
      showToast('Note deleted');
    } catch (error) { showToast(error.message, 'error'); }
  }));
}

/* Review drawer */
function recordForReview(dataset) {
  const t = state.tracker;
  const student = t.students.find((row) => row.id === dataset.studentId);
  const week = t.weeks.find((row) => row.id === dataset.weekId);
  const attendance = t.attendance.find((row) => row.student_id === dataset.studentId && row.week_id === dataset.weekId);
  const checkin = t.checkins.find((row) => row.student_id === dataset.studentId && row.week_id === dataset.weekId);
  const assignment = dataset.assignmentId ? t.assignments.find((row) => row.id === dataset.assignmentId) : null;
  const homework = assignment ? t.homework.find((row) => row.student_id === dataset.studentId && row.assignment_id === assignment.id) : null;
  return { type: dataset.reviewType, student, week, attendance, checkin, assignment, homework };
}

function openReview(dataset) {
  const record = recordForReview(dataset);
  state.activeReview = record;
  if (record.type !== 'attendance') {
    state.reviewQueue = buildReviewQueue(record.type, record.week.id, record.assignment?.id);
    state.reviewIndex = Math.max(0, state.reviewQueue.findIndex((item) => item.student.id === record.student.id));
  }
  renderReviewDrawer();
}

function buildReviewQueue(type, weekId, assignmentId) {
  return state.tracker.students.map((student) => recordForReview({ reviewType: type, studentId: student.id, weekId, assignmentId })).filter((record) => type === 'checkin' ? record.checkin?.status !== 'draft' && record.checkin : record.homework?.status !== 'draft' && record.homework);
}

function lifecycle(stateName) {
  const labels = { none: 'No draft', generating: 'Generating', ai_drafted: 'AI drafted', teacher_edited: 'Teacher edited', returned: 'Submitted to student', failed: 'Draft failed' };
  const notes = {
    ai_drafted: 'Review and edit before sending.',
    failed: 'The AI draft could not be generated. Write the reply yourself, or try again.',
    none: 'No AI draft was generated for this submission.',
  };
  const retryable = ['failed', 'none', 'ai_drafted', 'teacher_edited'].includes(stateName);
  return `<div class="lifecycle-row">
    <span class="ai-state"><span class="pill ${stateName === 'returned' ? 'green' : stateName === 'failed' ? 'red' : 'orange'}">${escapeHtml(labels[stateName] || stateName)}</span></span>
    ${notes[stateName] ? `<span class="muted small">${escapeHtml(notes[stateName])}</span>` : ''}
    ${retryable ? `<button class="btn small" id="redraft-feedback">${svg.spark} ${stateName === 'failed' || stateName === 'none' ? 'Generate AI draft' : 'Regenerate draft'}</button>` : ''}
  </div>`;
}

/* The AI draft can fail (OpenAI down, key rotated). Rather than leaving the
   teacher to start from nothing, offer a retry that overwrites the draft. */
async function redraftFeedback() {
  const record = state.activeReview;
  const isCheckin = record.type === 'checkin';
  const row = isCheckin ? record.checkin : record.homework;
  const button = document.getElementById('redraft-feedback');
  if (!row || !button) return;
  const existing = isCheckin
    ? document.getElementById('checkin-feedback')?.value.trim()
    : [document.getElementById('homework-corrections')?.value.trim(), document.getElementById('homework-general')?.value.trim()].filter(Boolean).join('');
  if (existing && !await askConfirm({ title: 'Replace what is written?', message: 'A fresh AI draft overwrites the text currently in the box.', confirmLabel: 'Generate a new draft' })) return;
  button.disabled = true;
  button.textContent = 'Generating…';
  try {
    const updated = await api(`/api/admin/${isCheckin ? 'checkins' : 'homework'}/${row.id}/redraft`, { method: 'POST' });
    Object.assign(row, updated);
    renderReviewDrawer();
    showToast('AI draft ready to review');
  } catch (error) {
    showToast(error.message, 'error');
    button.disabled = false;
    button.textContent = 'Generate AI draft';
  }
}

function renderReviewDrawer() {
  const record = state.activeReview;
  const nav = record.type === 'attendance' ? '' : `<div class="review-nav"><button class="btn small" id="review-prev" ${state.reviewIndex <= 0 ? 'disabled' : ''}>← Previous</button><span class="small muted">${state.reviewIndex + 1} of ${state.reviewQueue.length}</span><button class="btn small" id="review-next" ${state.reviewIndex >= state.reviewQueue.length - 1 ? 'disabled' : ''}>Next →</button><span class="kbd">←</span><span class="kbd">→</span><span class="kbd">Enter</span></div>`;
  let body = '', actions = '';
  if (record.type === 'attendance') {
    const current = record.attendance?.status || 'unknown';
    const source = record.attendance?.source === 'csv' ? 'Imported from a CSV upload' : record.attendance ? 'Set by hand' : 'Nothing recorded yet';
    body = `<div class="detail-grid">
        <div class="detail"><small>Student</small><strong>${escapeHtml(record.student.name)}</strong></div>
        <div class="detail"><small>Source</small><strong>${escapeHtml(source)}</strong></div>
      </div>
      <div class="stack-top">
        <div class="form-field"><label for="attendance-status">Attendance status</label><select id="attendance-status">
          <option value="live" ${current === 'live' ? 'selected' : ''}>Attended live</option>
          <option value="partial" ${current === 'partial' ? 'selected' : ''}>Partially attended</option>
          <option value="recording" ${current === 'recording' ? 'selected' : ''}>Watched the recording</option>
          <option value="missed" ${current === 'missed' ? 'selected' : ''}>Did not attend</option>
          <option value="unknown" ${current === 'unknown' ? 'selected' : ''}>Not recorded</option>
        </select><div class="muted small">Only "attended live" shows as green on the tracker. Watching the recording does not count as live attendance.</div></div>
        <div class="form-field"><label for="attendance-minutes">Minutes attended</label><input id="attendance-minutes" type="number" min="0" max="1440" value="${Number(record.attendance?.minutes || 0)}"></div>
        <div class="form-field"><label for="attendance-notes">Internal notes</label><textarea id="attendance-notes" placeholder="Only you can see this.">${escapeHtml(record.attendance?.notes || '')}</textarea></div>
      </div>`;
    actions = `<button class="btn" data-close-drawer>Close</button><button class="btn primary" id="save-attendance-record">Save attendance</button>`;
  } else if (record.type === 'checkin') {
    const row = record.checkin;
    if (!row || row.status === 'draft') {
      body = `${missingWorkPanel(record, 'checkin')}`;
      actions = `<button class="btn" data-close-drawer>Close</button><button class="btn primary" id="nudge-student">${svg.mail} Send a reminder</button>`;
    } else {
      const answers = row.answers || {};
      body = `<div class="detail-grid"><div class="detail"><small>Understanding</small><strong>${answers.understanding || '—'}/10</strong></div><div class="detail"><small>Confidence</small><strong>${answers.confidence || '—'}/10</strong></div><div class="detail"><small>Reviewed material</small><strong>${escapeHtml(answers.reviewed || '—')}</strong></div><div class="detail"><small>Status</small><strong>${row.status === 'returned' ? 'Returned' : 'Submitted'}</strong></div></div>
        <div class="section-title">Weekly win</div><div class="answer-box">${escapeHtml(answers.weeklyWin || 'No weekly win submitted.')}</div>
        <div class="section-title">Support requested</div><div class="answer-box">${escapeHtml(answers.support || 'No support requested.')}</div>
        ${lifecycle(row.feedback_state)}
        <div class="form-field"><div class="input-row"><label for="checkin-feedback">Teacher response</label>${dictateButton('checkin-feedback')}</div><textarea id="checkin-feedback">${escapeHtml(row.teacher_feedback || row.ai_feedback || '')}</textarea><div class="muted small">Enter submits. Shift + Enter adds a new line.</div></div>
        ${voiceNoteBlock(record)}`;
      actions = `<button class="btn" id="save-checkin-draft">Save draft</button><button class="btn primary" id="return-checkin">${row.status === 'returned' ? 'Update submitted reply' : 'Submit reply'}</button>`;
    }
  } else {
    const row = record.homework;
    if (!row || row.status === 'draft') {
      body = `${missingWorkPanel(record, 'homework')}`;
      actions = `<button class="btn" data-close-drawer>Close</button><button class="btn primary" id="nudge-student">${svg.mail} Send a reminder</button>`;
    } else {
      const answers = Array.isArray(row.answers) ? row.answers : [];
      body = `<div class="detail-grid"><div class="detail"><small>Assignment</small><strong>${escapeHtml(record.assignment.title)}</strong></div><div class="detail"><small>Questions answered</small><strong>${answers.filter((answer) => String(answer).trim()).length}/${record.assignment.questions.length}</strong></div></div>
        ${record.assignment.questions.map((question, index) => `<div class="section-title">Question ${index + 1}</div><div class="answer-box"><strong>${escapeHtml(question.prompt)}</strong><br><br>${escapeHtml(answers[index] || 'No answer submitted.')}</div>`).join('')}
        ${submittedFilesBlock(row.files)}
        ${lifecycle(row.feedback_state)}
        <div class="form-field"><div class="input-row"><label for="homework-corrections">1. Irish corrections</label>${dictateButton('homework-corrections', 'light')}</div><textarea class="corrections" id="homework-corrections">${escapeHtml(row.teacher_corrections || row.ai_corrections || '')}</textarea><div class="muted small">If there are no genuine errors, this should say “No Irish corrections needed.” Dictation here only adds punctuation, so your Irish is never rewritten.</div></div>
        <div class="form-field"><div class="input-row"><label for="homework-general">2. General feedback</label>${dictateButton('homework-general')}</div><textarea id="homework-general">${escapeHtml(row.teacher_general_feedback || row.ai_general_feedback || '')}</textarea><div class="muted small">Enter submits. Shift + Enter adds a new line.</div></div>
        ${voiceNoteBlock(record)}`;
      actions = `<button class="btn" id="save-homework-draft">Save draft</button><button class="btn primary" id="return-homework">${row.status === 'returned' ? 'Update submitted feedback' : 'Submit feedback'}</button>`;
    }
  }
  openDrawer({
    title: `${record.student.name} · ${record.type === 'checkin' ? 'Weekly check-in' : record.type === 'homework' ? 'Homework' : 'Attendance'}`,
    subtitle: `${fmtWeek(record.week.week_start)} · ${state.tracker.class.label}`,
    body, footer: `<div>${nav}</div><div class="actions">${actions}</div>`,
    onOpen: bindReviewDrawer,
  });
}

/* What you see when you click a cell with nothing in it. The point of this screen
   is not the absent feedback, it is deciding whether to chase the student. */
function missingWorkPanel(record, type) {
  const isCheckin = type === 'checkin';
  const deadline = isCheckin ? record.week.checkin_due_at : (record.assignment.reopened_until || record.assignment.deadline_at);
  const closed = isCheckin
    ? record.week.checkin_hard_deadline !== false && Date.now() > new Date(deadline).getTime()
    : assignmentClosed(record.assignment);
  const draft = isCheckin ? record.checkin : record.homework;
  const off = isCheckin && record.week.checkin_enabled === false;

  return `<div class="detail-grid">
      <div class="detail"><small>${isCheckin ? 'Week' : 'Assignment'}</small><strong>${escapeHtml(isCheckin ? `Week of ${fmtWeek(record.week.week_start)}` : record.assignment.title)}</strong></div>
      <div class="detail"><small>${closed ? 'Closed' : 'Due'}</small><strong>${escapeHtml(fmtDate(deadline, { time: true, weekday: true, dateStyle: 'short' }))}</strong></div>
    </div>
    <div class="missing-panel ${off ? '' : closed ? 'is-closed' : 'is-open'}">
      <span class="status-icon ${off ? 'grey' : closed ? 'red' : 'grey'}">${svg[off ? 'talk' : closed ? 'x' : (isCheckin ? 'talk' : 'book')]}</span>
      <div>
        <strong>${off ? 'No check-in was set for this week' : closed ? 'The deadline passed with nothing submitted' : 'Nothing submitted yet'}</strong>
        <span>${off
          ? 'This week was switched off, so nothing was expected.'
          : draft
            ? `${escapeHtml(record.student.name.split(' ')[0])} started it and saved a draft, but has not sent it.`
            : `${escapeHtml(record.student.name.split(' ')[0])} has not opened it yet.`}
          ${off ? '' : ' Feedback stays blank until something is submitted, and no AI draft is generated.'}</span>
      </div>
    </div>
    <p class="muted small" id="nudge-history"></p>`;
}

async function openNudgeModal() {
  const record = state.activeReview;
  const isCheckin = record.type === 'checkin';
  const settings = state.settings?.nudge ? state.settings : await api('/api/settings').catch(() => null);
  const nudge = settings?.nudge || {};
  const first = record.student.name.split(' ')[0];
  const itemTitle = isCheckin ? `Week of ${fmtWeek(record.week.week_start)}` : record.assignment.title;
  const deadline = fmtDate(isCheckin ? record.week.checkin_due_at : (record.assignment.reopened_until || record.assignment.deadline_at), { time: true, weekday: true, dateStyle: 'short' });
  const fill = (template) => String(template || '')
    .replace(/\{\{\s*first_name\s*\}\}/g, first)
    .replace(/\{\{\s*item_title\s*\}\}/g, itemTitle)
    .replace(/\{\{\s*deadline\s*\}\}/g, deadline)
    .replace(/\{\{\s*link\s*\}\}/g, location.origin);

  const subject = fill(isCheckin ? nudge.checkinSubject : nudge.homeworkSubject) || `A quick nudge about ${itemTitle}`;
  const body = fill(isCheckin ? nudge.checkinBody : nudge.homeworkBody) || `Hi ${first},\n\n${itemTitle} has not come in yet. You can pick it up at ${location.origin}.`;

  modal({
    title: `Remind ${escapeHtml(first)}`,
    subtitle: `${record.student.email} · ${itemTitle}`,
    body: `<div class="form-field"><label for="nudge-subject">Subject</label><input id="nudge-subject" value="${escapeHtml(subject)}"></div>
      <div class="form-field"><div class="input-row"><label for="nudge-body">Message</label>${dictateButton('nudge-body')}</div><textarea id="nudge-body" class="tall">${escapeHtml(body)}</textarea></div>
      <p class="muted small">Edit anything before it goes. The wording you start from is on the Email reminders screen.</p>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="send-nudge">Send to ${escapeHtml(first)}</button>`,
    onOpen() {
      bindDictation(modalRoot);
      document.getElementById('send-nudge').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true; button.textContent = 'Sending…';
        try {
          const result = await api('/api/admin/nudge', {
            method: 'POST',
            body: {
              studentId: record.student.id,
              type: record.type,
              weekId: isCheckin ? record.week.id : undefined,
              assignmentId: isCheckin ? undefined : record.assignment.id,
              subject: document.getElementById('nudge-subject').value,
              body: document.getElementById('nudge-body').value,
            },
          });
          closeModal();
          showToast(result.status === 'simulated'
            ? 'Email is in test mode, so nothing was actually delivered'
            : `Reminder sent to ${result.to}`, result.status === 'simulated' ? 'error' : '');
          loadNudgeHistory();
        } catch (error) {
          showToast(error.message, 'error');
          button.disabled = false; button.textContent = `Send to ${first}`;
        }
      });
    },
  });
}

/** Shows when this student was last chased about this exact thing. */
async function loadNudgeHistory() {
  const target = document.getElementById('nudge-history');
  const record = state.activeReview;
  if (!target || !record) return;
  const isCheckin = record.type === 'checkin';
  const params = new URLSearchParams({ studentId: record.student.id, type: record.type });
  if (isCheckin) params.set('weekId', record.week.id); else params.set('assignmentId', record.assignment.id);
  try {
    const { lastSentAt } = await api(`/api/admin/nudge/history?${params}`);
    target.textContent = lastSentAt
      ? `Last reminded ${fmtDate(lastSentAt, { time: true, weekday: true, dateStyle: 'short' })}.`
      : 'No reminder sent about this yet.';
  } catch { target.textContent = ''; }
}

/* What the student handed up, and the text that was read out of it — which is
   what the corrections were actually generated from, so it is worth seeing. */
function submittedFilesBlock(files) {
  if (!files?.length) return '';
  return `<div class="section-title">Uploaded work</div>
    ${files.map((file) => `<div class="submitted-file">
      <div class="submitted-file-head">
        <a class="btn small" href="/api/media/homework-file/${file.id}" target="_blank" rel="noopener">${svg.book} ${escapeHtml(file.fileName)}</a>
        <span class="muted small">${escapeHtml(fmtBytes(file.sizeBytes))}${file.extractionState === 'done' ? '' : file.extractionState === 'failed' ? ' · could not be read automatically' : ' · not read'}</span>
      </div>
      ${file.extractedText ? `<details class="extracted"><summary>What was read from it</summary><div class="answer-box">${escapeHtml(file.extractedText)}</div></details>` : ''}
    </div>`).join('')}`;
}

function bindReviewDrawer() {
  document.getElementById('review-prev')?.addEventListener('click', () => navigateReview(-1));
  document.getElementById('review-next')?.addEventListener('click', () => navigateReview(1));
  document.getElementById('save-checkin-draft')?.addEventListener('click', saveCheckinFeedback);
  document.getElementById('return-checkin')?.addEventListener('click', () => submitReview('checkin'));
  document.getElementById('save-homework-draft')?.addEventListener('click', saveHomeworkFeedback);
  document.getElementById('return-homework')?.addEventListener('click', () => submitReview('homework'));
  document.getElementById('save-attendance-record')?.addEventListener('click', saveManualAttendance);
  document.getElementById('redraft-feedback')?.addEventListener('click', redraftFeedback);
  document.getElementById('nudge-student')?.addEventListener('click', openNudgeModal);
  if (document.getElementById('nudge-history')) loadNudgeHistory();
  bindDictation(modalRoot);
  bindVoiceNote();
  const inputs = [document.getElementById('checkin-feedback'), document.getElementById('homework-corrections'), document.getElementById('homework-general')].filter(Boolean);
  inputs.forEach((input) => input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitReview(state.activeReview.type); }
  }));
}

/* Registered once for the life of the page. An earlier version re-armed a
   one-shot listener from inside the handler, so the first keystroke inside a
   textarea consumed it and arrow-key navigation stopped working for the rest of
   the review session. */
function reviewKeyHandler(event) {
  if (!document.querySelector('.drawer.open') || !state.activeReview || state.activeReview.type === 'attendance') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); navigateReview(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); navigateReview(1); }
}
document.addEventListener('keydown', reviewKeyHandler);

function navigateReview(direction) {
  const next = state.reviewIndex + direction;
  if (next < 0 || next >= state.reviewQueue.length) return;
  state.reviewIndex = next; state.activeReview = state.reviewQueue[next]; renderReviewDrawer();
}

async function saveManualAttendance() {
  try {
    const row = await api(`/api/admin/attendance/${state.activeReview.week.id}/${state.activeReview.student.id}`, {
      method: 'PUT',
      body: {
        status: document.getElementById('attendance-status').value,
        minutes: Number(document.getElementById('attendance-minutes').value) || 0,
        notes: document.getElementById('attendance-notes').value,
      },
    });
    const index = state.tracker.attendance.findIndex((item) => item.student_id === row.student_id && item.week_id === row.week_id);
    if (index >= 0) state.tracker.attendance[index] = row; else state.tracker.attendance.push(row);
    closeModal(); await renderAdmin(); showToast('Attendance updated');
  } catch (error) { showToast(error.message, 'error'); }
}

async function saveCheckinFeedback() {
  try {
    const row = await api(`/api/admin/checkins/${state.activeReview.checkin.id}/feedback-draft`, { method: 'PATCH', body: { feedback: document.getElementById('checkin-feedback').value } });
    Object.assign(state.activeReview.checkin, row); showToast('Reply draft saved');
  } catch (error) { showToast(error.message, 'error'); }
}

async function saveHomeworkFeedback() {
  try {
    const row = await api(`/api/admin/homework/${state.activeReview.homework.id}/feedback-draft`, { method: 'PATCH', body: { corrections: document.getElementById('homework-corrections').value, generalFeedback: document.getElementById('homework-general').value } });
    Object.assign(state.activeReview.homework, row); showToast('Feedback draft saved');
  } catch (error) { showToast(error.message, 'error'); }
}

async function submitReview(type) {
  try {
    if (type === 'checkin') {
      const feedback = document.getElementById('checkin-feedback').value.trim();
      const hasVoiceNote = Boolean(state.activeReview.checkin.voice_note);
      if (!feedback && !hasVoiceNote) throw new Error('Write a reply or record a voice note first.');
      const row = await api(`/api/admin/checkins/${state.activeReview.checkin.id}/return`, { method: 'POST', body: { feedback } });
      Object.assign(state.activeReview.checkin, row);
    } else {
      const corrections = document.getElementById('homework-corrections').value.trim();
      const generalFeedback = document.getElementById('homework-general').value.trim();
      const hasVoiceNote = Boolean(state.activeReview.homework.voice_note);
      if ((!corrections || !generalFeedback) && !hasVoiceNote) throw new Error('Complete both feedback sections, or record a voice note.');
      const row = await api(`/api/admin/homework/${state.activeReview.homework.id}/return`, { method: 'POST', body: { corrections, generalFeedback } });
      Object.assign(state.activeReview.homework, row);
    }
    showToast('Feedback submitted to student');
    const current = state.reviewIndex;
    const remaining = state.reviewQueue.filter((_, index) => index !== current);

    /* Repaint the tracker straight away so the cell you just replied to turns
       green. This used to wait until the review queue emptied, which meant
       working through a batch left every finished cell still showing orange. */
    await renderAdmin();

    // renderAdmin replaced the tracker data, so the queue is re-resolved against
    // the new rows rather than left pointing at the old ones.
    state.reviewQueue = remaining
      .map((item) => recordForReview({
        reviewType: item.type,
        studentId: item.student.id,
        weekId: item.week.id,
        assignmentId: item.assignment?.id,
      }))
      .filter((item) => (item.type === 'checkin' ? item.checkin : item.homework));

    if (state.reviewQueue.length) {
      state.reviewIndex = Math.min(current, state.reviewQueue.length - 1);
      state.activeReview = state.reviewQueue[state.reviewIndex];
      renderReviewDrawer();
    } else {
      closeModal();
    }
  } catch (error) { showToast(error.message, 'error'); }
}

/* Student */
function studentNav() {
  const notifications = state.studentData?.notifications || 0;
  return `<div class="nav-label">My course</div><nav class="nav">
    ${studentNavButton('calendar', svg.calendar, 'Calendar')}
    ${studentNavButton('tracker', svg.grid, 'Weekly tracker', notifications)}
    ${studentNavButton('courses', svg.cap, 'Courses')}
    ${/* A class set up without a board never shows Community at all. */
      state.studentData?.hasCommunity
        ? studentNavButton('community', svg.board, 'Community', state.studentData?.communityUnread || 0)
        : ''}
    ${studentNavButton('private', svg.lock, 'Private message')}
  </nav>`;
}

function studentNavButton(view, icon, label, badge = 0) {
  return `<button class="nav-button ${state.view === view ? 'active' : ''}" data-student-view="${view}"><span class="nav-icon">${icon}</span>${label}${badge ? `<span class="nav-badge">${badge}</span>` : ''}</button>`;
}

async function loadStudent() {
  state.studentData = await api('/api/student/bootstrap');
  state.view ||= 'calendar';
  renderStudent();
}

const STUDENT_TITLES = { tracker: 'Weekly tracker', community: 'Community', courses: 'Courses', calendar: 'Calendar', private: 'Private message' };

function renderStudent() {
  let content = '';
  if (!state.studentData.class && state.view !== 'account') {
    content = `${studentHeader()}<div class="empty-state"><h3>You are not in a class yet</h3><p>Your account is active but has not been added to a class group. Contact Gaeilgeoir Guides and they will add you.</p></div>`;
  } else if (state.view === 'tracker') content = studentTrackerView();
  else if (state.view === 'courses') content = state.course ? coursePage() : coursesView();
  else if (state.view === 'private') content = privateMessageView();
  else if (state.view === 'community') {
    // Reachable by a stale hash after a class loses its board.
    if (state.studentData?.hasCommunity) content = studentCommunityView();
    else { state.view = 'calendar'; content = studentCalendarView(); }
  }
  else content = studentCalendarView();
  shell({ nav: studentNav(), content, title: STUDENT_TITLES[state.view] || 'Calendar', roleLabel: 'Student', notificationCount: state.studentData.notifications });
  bindStudentView();
  if (state.view === 'courses') bindCourse();
  if (state.view === 'private') {
    mountChatWidget();
    document.getElementById('private-to-board')?.addEventListener('click', () => {
      state.view = 'community';
      renderStudent();
    });
  } else {
    unmountChatWidget();
  }
}

/* The class link, shown where a student already goes on the evening of a class.
   It appears twelve hours out and stays until the session is over, so the button
   is there when it is wanted and gone the rest of the week — a permanent Join
   button is one more thing on the screen that is usually wrong. */
/**
 * The hour, as somebody would say it.
 *
 * "7pm" rather than "19:00", and "7.30pm" rather than "19:30". A student
 * checking when class is does not want a timetable, and IST means nothing to
 * most people reading it — "Irish" is what the abbreviation was standing in for.
 */
function plainHour(value, timeZone = classTimezone()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  const hour24 = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? 'am' : 'pm';
  return minute ? `${hour}.${String(minute).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}

/**
 * The passcode out of whatever was typed into the note field.
 *
 * The field has always been free text and people write "Passcode 4821" into it,
 * so labelling it would otherwise read "Passcode: Passcode 4821". Anything that
 * is not a passcode at all is left exactly as written.
 */
function passcodeOnly(note) {
  const text = String(note || '').trim();
  const match = /^pass\s*code\s*[:\-]?\s*(.+)$/i.exec(text);
  return match ? match[1].trim() : text;
}

function nextClassBanner() {
  const next = state.studentData?.nextClass;
  const thisWeek = state.studentData?.thisWeek;

  /* A week that is not the usual thing says so first. The banner below names the
     next live class, which is right — but a week replaced by a recording would
     otherwise pass in silence, and a student would find out only by nobody
     turning up. */
  const notice = thisWeek && thisWeek.kind !== 'moved'
    ? `<section class="week-notice is-${escapeHtml(thisWeek.kind)}">
        <span class="week-notice-icon">${thisWeek.kind === 'recorded' ? svg.play || svg.video : svg.calendar}</span>
        <div>
          <strong>${thisWeek.kind === 'recorded' ? 'This week is pre-recorded' : 'No class this week'}</strong>
          <span>${escapeHtml(thisWeek.reason || (thisWeek.kind === 'recorded'
            ? 'Watch the recording in Courses whenever it suits you. There is no live class.'
            : 'The class is not meeting this week. Your check-in and homework are unaffected.'))}</span>
        </div>
      </section>`
    : '';

  if (!next) return notice;
  const when = next.live
    ? 'Happening now'
    : next.soon
      ? `Starts ${next.minutesAway < 60 ? `in ${next.minutesAway} minute${next.minutesAway === 1 ? '' : 's'}` : `in ${Math.round(next.minutesAway / 60)} hours`}`
      : `Next class ${fmtDate(next.startsAt, { weekday: true, time: true, dateStyle: 'short' })}`;
  // The button is there whenever there is a link at all — somebody checking on a
  // Sunday to find the room should not be told to come back tomorrow. What the
  // hours change is the urgency of the wording above it.
  if (!next.joinUrl && !next.live && !next.soon) return notice;
  return `${notice}<section class="class-banner ${next.live ? 'is-live' : ''}">
    <span class="class-banner-icon">${svg.video}</span>
    <div class="class-banner-copy">
      <strong>${escapeHtml(when)}</strong>
      <span>${escapeHtml(next.live || next.soon ? fmtDate(next.startsAt, { weekday: true, time: true, dateStyle: 'short' }) : fmtDate(next.startsAt, { dateStyle: 'medium' }))} · ${escapeHtml(plainHour(next.startsAt, next.timezone))} Irish${next.note ? ` · Passcode: ${escapeHtml(passcodeOnly(next.note))}` : ''}${next.movedFrom ? ' · moved from its usual day' : ''}</span>
    </div>
    ${next.joinUrl
      ? `<a class="btn primary" href="${escapeHtml(next.joinUrl)}" target="_blank" rel="noopener noreferrer">${next.live ? 'Join now' : 'Join class'}</a>`
      : '<span class="muted small">No link yet</span>'}
  </section>`;
}

const STUDENT_PAGE = {
  calendar: { title: 'Calendar', line: 'Your classes, your deadlines, and the feedback that comes back.' },
  tracker: { title: 'Weekly tracker', line: 'Every week of the course at a glance.' },
  courses: { title: 'Courses', line: 'Class recordings, with the notes that go with them.' },
  community: { title: 'Community', line: 'Ask a question, or answer somebody else.' },
  private: { title: 'Private message', line: 'For anything you would rather not put on the board.' },
};

/* A page title, not a greeting.
   ------------------------------------------------------------------
   The panel that used to sit here said hello on every screen and took a third
   of a phone before anything useful. A person who signs in knows their own
   name; what they do not know is which screen they are on. */
function studentHeader() {
  const copy = STUDENT_PAGE[state.view] || STUDENT_PAGE.calendar;
  return `<header class="sh">
    <div>
      <h1>${escapeHtml(copy.title)}</h1>
      <p>${escapeHtml(copy.line)}</p>
    </div>
    ${state.studentData?.class ? `<span class="sh-class">${escapeHtml(state.studentData.class.label)}</span>` : ''}
  </header>
  ${nextClassBanner()}`;
}

/**
 * How much this student has handed in.
 *
 * Worked out on the server and sent with the bootstrap, because the milestone
 * rule belongs in one place — three screens call this and all three should agree
 * about whether ten pieces of work have been handed in.
 *
 * It was being called as a function that had never been written, so every caller
 * threw: the goal strip vanished, and the celebration after handing work in
 * never appeared at all. What looked like a rough transition was the screen
 * failing silently on its way to being drawn.
 */
function studentProgress() {
  return state.studentData?.progress
    || { checkins: 0, homework: 0, total: 0, next: null, toNext: 0, towards: 0, justHit: null };
}

function studentGoals() {
  const progress = studentProgress();
  if (!progress.total) return '';
  const chip = (value, label) => `<div class="goal"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
  return `<section class="goal-strip">
    ${chip(progress.checkins, progress.checkins === 1 ? 'check-in done' : 'check-ins done')}
    ${chip(progress.homework, progress.homework === 1 ? 'homework done' : 'homework done')}
  </section>`;
}

/* Replaces the flat "thank you" that used to follow a submission. */
function celebrationScreen({ title, line, progress, milestone, alreadyCelebrated = false }) {
  // The confetti may have been fired the instant the work was accepted, rather
  // than after the page caught up. Firing it twice looks like a glitch.
  if (!alreadyCelebrated) celebrate({ big: Boolean(milestone) });
  const milestoneLine = milestone
    ? `<div class="celebrate-milestone">That is <strong>${milestone}</strong> pieces of work handed in. Sin obair mhaith.</div>`
    : '';
  modal({
    title: '',
    body: `<div class="celebrate">
      <div class="celebrate-tick"><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l8 8 15-16"/></svg></div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(line)}</p>
      ${milestoneLine}
    </div>`,
    footer: '<button class="btn primary" data-close-modal>Back to my deadlines</button>',
  });
}

function studentMaps() {
  const assignmentsByWeek = new Map();
  state.studentData.assignments.forEach((assignment) => {
    if (!assignment.week_id) return;
    assignmentsByWeek.set(assignment.week_id, [...(assignmentsByWeek.get(assignment.week_id) || []), assignment]);
  });
  return {
    attendance: new Map(state.studentData.attendance.map((row) => [row.week_id, row])),
    checkins: new Map(state.studentData.checkins.map((row) => [row.week_id, row])),
    homework: new Map(state.studentData.homework.map((row) => [row.assignment_id, row])),
    assignmentsByWeek,
  };
}

const itemRef = (item) => (item.type === 'checkin' ? item.week?.id : item.assignment?.id) || '';

/* A hard deadline that has gone cannot be met, so leaving it in the list is a
   reminder to do something impossible. Clearing it changes this student's list
   and nothing else: the tracker still records the miss, and the teacher still
   sees it. */
function isDismissed(item) {
  const ref = itemRef(item);
  return (state.studentData?.dismissals || []).some((row) => row.kind === item.type && row.refId === ref);
}

async function dismissDeadline(kind, refId, title) {
  try {
    await api('/api/student/dismissals', { method: 'POST', body: { kind, refId } });
  } catch (error) { return showToast(error.message, 'error'); }
  state.studentData.dismissals = [...(state.studentData.dismissals || []), { kind, refId }];
  renderStudent();
  showToast(`Cleared. ${title} is still recorded in your tracker.`, '', {
    label: 'Undo',
    async action() {
      try { await api(`/api/student/dismissals/${kind}/${refId}`, { method: 'DELETE' }); }
      catch (error) { return showToast(error.message, 'error'); }
      state.studentData.dismissals = (state.studentData.dismissals || [])
        .filter((row) => !(row.kind === kind && row.refId === refId));
      renderStudent();
    },
  });
}

function studentCalendarView() {
  const maps = studentMaps();
  const items = [];
  state.studentData.weeks.forEach((week) => {
    if (week.checkin_enabled && week.checkin_available) {
      const checkin = maps.checkins.get(week.id);
      items.push({ type: 'checkin', title: `Week of ${fmtWeek(week.week_start)} check-in`, due: week.checkin_due_at, status: checkinState(checkin, week), week, checkin, submitted: Boolean(checkin && checkin.status !== 'draft') });
    }
  });
  state.studentData.assignments.forEach((assignment) => {
    const submission = maps.homework.get(assignment.id);
    items.push({ type: 'homework', title: assignment.title, due: assignment.reopened_until || assignment.deadline_at, status: homeworkState(submission, assignment), assignment, submission, submitted: Boolean(submission && submission.status !== 'draft') });
  });

  // Anything already handed in disappears from this list entirely — it is not work
  // to do. What is left splits by whether the deadline has gone.
  const outstanding = items.filter((item) => !item.submitted);
  const upcoming = outstanding.filter((item) => item.status.tone !== 'red').sort((a, b) => new Date(a.due) - new Date(b.due));
  const overdue = outstanding
    .filter((item) => item.status.tone === 'red' && !isDismissed(item))
    .sort((a, b) => new Date(b.due) - new Date(a.due));

  const card = (item) => `<article class="deadline-card ${item.status.tone}">
    ${item.status.tone === 'red' ? `<button class="deadline-dismiss" data-dismiss="${item.type}" data-ref="${itemRef(item)}" title="Clear this from your list" aria-label="Clear ${escapeHtml(item.title)} from your list">&times;</button>` : ''}
    <small>${escapeHtml(fmtDate(item.due, { time: true, weekday: true, dateStyle: 'short' }))}</small>
    <strong>${escapeHtml(item.title)}</strong>
    <p>${escapeHtml(item.status.hint || item.status.label)}</p>
    <button class="btn ${item.status.tone === 'red' ? '' : 'primary'} small" data-open-student-item="${item.type}" data-week-id="${item.week?.id || ''}" data-assignment-id="${item.assignment?.id || ''}">${item.status.tone === 'red' ? 'View' : 'Open'}</button>
  </article>`;

  return `${studentHeader()}${studentTabs('calendar')}${checkinWindowNote()}
    <div class="student-layout"><section class="card calendar">${calendarHtml()}</section>
    <div class="deadline-column">
      ${overdue.length ? `<aside class="card overdue-card">
        <div class="card-header"><div><h2>Overdue</h2><p>${overdue.length} deadline${overdue.length === 1 ? '' : 's'} passed without a submission.</p></div><span class="pill red">${overdue.length}</span></div>
        <div class="card-body deadline-list">${overdue.map(card).join('')}</div>
      </aside>` : ''}
      <aside class="card"><div class="card-header"><div><h2>Upcoming work</h2><p>Still to do. Times in ${escapeHtml(classTimezone())}.</p></div></div>
      <div class="card-body deadline-list">${upcoming.slice(0, 6).map(card).join('') || '<div class="empty-state"><h3>Nothing due</h3><p>You are fully up to date.</p></div>'}</div></aside>
    </div></div>`;
}

/** Calendar day for an instant, read in the class timezone rather than the viewer's. */
function zonedDateParts(value, timeZone = classTimezone()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month) - 1, day: Number(parts.day) };
}

/** Calendar events carry their status colour, and the month can be paged. */
function calendarHtml() {
  const cursor = state.calendarMonth ? new Date(state.calendarMonth) : new Date();
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const today = zonedDateParts(new Date());
  const isToday = (day) => today.year === year && today.month === month && today.day === day;
  const maps = studentMaps();
  const events = new Map();
  const add = (dateValue, html) => {
    // A Sunday 20:00 Dublin deadline must land on Sunday for everyone, including
    // a student reading this from another timezone.
    const when = zonedDateParts(dateValue);
    if (when.year !== year || when.month !== month) return;
    events.set(when.day, [...(events.get(when.day) || []), html]);
  };
  state.studentData.weeks.forEach((week) => {
    if (!week.checkin_enabled || !week.checkin_available) return;
    const checkin = maps.checkins.get(week.id);
    const status = checkinState(checkin, week);
    add(week.checkin_due_at, `<button class="calendar-event ${status.tone}" title="${escapeHtml(status.hint)}" data-open-student-item="checkin" data-week-id="${week.id}">${escapeHtml(checkin?.status === 'returned' ? 'Check-in feedback' : 'Check-in')}</button>`);
  });
  state.studentData.assignments.forEach((assignment) => {
    const submission = maps.homework.get(assignment.id);
    const status = homeworkState(submission, assignment);
    add(assignment.reopened_until || assignment.deadline_at, `<button class="calendar-event ${status.tone}" title="${escapeHtml(status.hint)}" data-open-student-item="homework" data-assignment-id="${assignment.id}">${escapeHtml(submission?.status === 'returned' ? 'Homework feedback' : assignment.title)}</button>`);
  });

  /* The classes themselves. A calendar that shows only what is due leaves out
     the thing the week is actually built around, and a student checking when
     they next have class had to look somewhere else for it. */
  (state.studentData.classDates || []).forEach((sitting) => {
    const label = {
      running: 'Class',
      recorded: 'Pre-recorded',
      moved: 'Class (moved)',
      skipped: 'No class',
      extra: sitting.label || 'Extra class',
    }[sitting.kind] || 'Class';
    const time = new Date(sitting.at).toLocaleTimeString('en-IE', {
      hour: '2-digit', minute: '2-digit', timeZone: classTimezone(),
    });
    add(sitting.at, `<button class="calendar-event is-class is-${escapeHtml(sitting.kind)}"
      title="${escapeHtml(`${label} · ${time}`)}"
      data-open-class="${escapeHtml(sitting.onDate)}" data-class-kind="${escapeHtml(sitting.kind)}"
      data-class-at="${escapeHtml(sitting.at)}">${escapeHtml(label)}</button>`);
  });
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<div class="calendar-day is-empty"></div>');
  for (let day = 1; day <= days; day += 1) {
    cells.push(`<div class="calendar-day ${isToday(day) ? 'is-today' : ''}"><div class="calendar-number">${day}</div>${(events.get(day) || []).join('')}</div>`);
  }
  return `<div class="calendar-head">
      <h2>${new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric' }).format(first)}</h2>
      <div class="calendar-nav"><button class="btn small" data-calendar-step="-1" aria-label="Previous month">←</button><button class="btn small" data-calendar-step="0">Today</button><button class="btn small" data-calendar-step="1" aria-label="Next month">→</button></div>
    </div>
    <div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => `<div class="calendar-name">${day}</div>`).join('')}${cells.join('')}</div>`;
}

/* The student tracker is a grid of week cards rather than one very wide table row.
   Each card holds up to three actions that always keep the same shape, so nothing
   overflows on a phone and the newest week is the one you land on. */
function studentTrackerView() {
  const maps = studentMaps();
  const weeks = [...state.studentData.weeks].reverse();
  if (!weeks.length) {
    return `${studentHeader()}${studentTabs('tracker')}<div class="empty-state"><h3>Your tracker is empty</h3><p>Weeks appear here once your class has started. Check back after your first session.</p></div>`;
  }
  const currentWeekId = state.studentData.weeks.at(-1)?.id;
  const cards = weeks.map((week) => {
    const checkin = maps.checkins.get(week.id);
    const assignments = maps.assignmentsByWeek.get(week.id) || [];
    const isCurrent = week.id === currentWeekId;
    const actions = [{
      state: attendanceState(maps.attendance.get(week.id)),
      name: 'Attendance',
      disabled: true,
      attributes: '',
    }];
    if (week.checkin_available) {
      const unread = checkin?.status === 'returned' && !checkin.feedback_read_at;
      actions.push({ state: { ...checkinState(checkin, week), unread }, name: 'Check-in', unread, attributes: `data-open-student-item="checkin" data-week-id="${week.id}"` });
    }
    if (assignments.length) {
      assignments.forEach((assignment) => {
        const homework = maps.homework.get(assignment.id);
        const unread = homework?.status === 'returned' && !homework.feedback_read_at;
        actions.push({ state: { ...homeworkState(homework, assignment), unread }, name: assignments.length > 1 ? assignment.title : 'Homework', unread, attributes: `data-open-student-item="homework" data-assignment-id="${assignment.id}"` });
      });
    } else {
      // Some weeks carry homework and some do not. Leaving the slot out entirely
      // made an empty week look identical to a week that had not loaded, so it
      // now says so plainly.
      actions.push({
        state: { tone: 'none', icon: 'book', label: 'None set', hint: 'There is no homework for this week' },
        name: 'Homework', disabled: true, attributes: '',
      });
    }
    const needsAction = actions.some((action) => action.unread || action.state.tone === 'grey');
    return `<article class="week-card ${needsAction ? 'is-open' : ''} ${isCurrent ? 'is-current' : ''}">
      <header class="week-card-head">
        <div><strong>Week of ${fmtWeek(week.week_start)}${isCurrent ? '<span class="week-now">This week</span>' : ''}</strong><span>Check-in due ${escapeHtml(fmtDate(week.checkin_due_at, { time: true, weekday: true, dateStyle: 'short' }))}</span></div>
      </header>
      <div class="week-card-actions" style="--cols:${actions.length}">
        ${actions.map((action) => `<button class="wk-action ${action.unread ? 'has-news' : ''}" ${action.disabled ? 'disabled' : action.attributes} aria-label="${escapeHtml(`${action.name}: ${action.state.hint || action.state.label}`)}">
          ${statusIcon(action.state)}<span class="wk-name">${escapeHtml(action.name)}</span>
        </button>`).join('')}
      </div>
      ${week.checkin_available ? '' : `<p class="week-card-note">Your check-in opens ${escapeHtml(fmtDate(week.checkin_release_at, { time: true, weekday: true, dateStyle: 'short' }))}.</p>`}
    </article>`;
  }).join('');
  return `${studentHeader()}${studentTabs('tracker')}
    <section class="card student-tracker">
      <div class="week-card-grid">${cards}</div>
      ${trackerLegend('student')}
    </section>`;
}

/* When check-ins open and close. Small, and on the screen where somebody is
   already looking at deadlines, because "why can I not do last week's" is the
   question it exists to answer. */
function checkinWindowNote() {
  return `<p class="win-note">Check-ins open <strong>Friday at 10am</strong> and close <strong>Sunday at 11:45pm</strong> Irish time. They cannot be completed after that.</p>`;
}

/* What is happening on one class date.
   ------------------------------------------------------------------
   Clicking a class on the calendar should answer the question that made
   somebody click it: is it on, when, and how do I get in. All of that is
   already in hand from the bootstrap, so this opens instantly rather than
   asking the server for something it has already sent. */
function openClassInfo(date, kind) {
  const sittings = (state.studentData?.classDates || []).filter((row) => row.onDate === date);
  const sitting = sittings.find((row) => row.kind === kind) || sittings[0];
  if (!sitting) return;

  const klass = state.studentData?.class;
  const zone = classTimezone();
  const at = new Date(sitting.at);
  const when = at.toLocaleString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', timeZone: zone,
  });
  const usual = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });

  /* The link is only offered where there is a class to join. Showing one beside
     "no class this week" is an invitation to sit in an empty room. */
  const next = state.studentData?.nextClass;
  const sameSitting = next && Math.abs(new Date(next.startsAt) - at) < 60000;
  const joinUrl = sitting.kind === 'extra'
    ? (sitting.joinUrl || next?.joinUrl || null)
    : (['running', 'moved'].includes(sitting.kind) ? (sameSitting ? next?.joinUrl : klass?.join_url) : null);

  const said = {
    running: ['Class as usual', `Your weekly class, at the time it always runs. Times shown in ${zone}.`],
    moved: ['This class has moved', `It was due on ${usual} and is running at the time above instead.`],
    recorded: ['Pre-recorded this week', 'There is no live class. The recording is in Courses whenever it suits you.'],
    skipped: ['No class this week', 'The class is not meeting. Your check-in and homework are unaffected.'],
    extra: [sitting.label || 'Extra class', 'An additional session on top of the weekly class.'],
  }[sitting.kind] || ['Class', ''];

  modal({
    title: said[0],
    subtitle: sitting.kind === 'skipped' ? usual : when,
    body: `<div class="class-info">
      <p>${escapeHtml(sitting.reason || said[1])}</p>
      ${sitting.kind === 'skipped' ? '' : `<dl class="class-info-rows">
        <div><dt>When</dt><dd>${escapeHtml(when)}</dd></div>
        <div><dt>Timezone</dt><dd>${escapeHtml(zone)}</dd></div>
        ${sitting.minutes ? `<div><dt>Length</dt><dd>${sitting.minutes} minutes</dd></div>` : ''}
        ${klass?.join_note && joinUrl ? `<div><dt>Passcode</dt><dd>${escapeHtml(passcodeOnly(klass.join_note))}</dd></div>` : ''}
      </dl>`}
    </div>`,
    footer: `<button class="btn" data-close-modal>Close</button>
      ${sitting.kind === 'recorded'
        ? '<button class="btn primary" id="class-info-courses">Go to Courses</button>'
        : joinUrl
          ? `<a class="btn primary" href="${escapeHtml(joinUrl)}" target="_blank" rel="noopener noreferrer">Join class</a>`
          : ''}`,
    onOpen() {
      document.getElementById('class-info-courses')?.addEventListener('click', () => {
        closeModal();
        state.view = 'courses';
        renderStudent();
      });
    },
  });
}

/* The private line, and an argument for not using it.
   ------------------------------------------------------------------
   The point of this screen is mostly to send people back to the board. A
   question asked privately is answered once; the same question on the board is
   answered once and read by twenty people, several of whom were about to ask it.
   So the case for the community is made first and made honestly — it is faster
   for the student too, because other students answer — and the private line is
   offered underneath for the things that genuinely are private. */
function privateMessageView() {
  const hasBoard = state.studentData?.hasCommunity;
  return `${studentHeader()}
    <div class="private-page">
      ${hasBoard ? `<section class="card private-first">
        <h2>Try the community first</h2>
        <p>Nearly every question about the course is one somebody else in the class
          is also sitting with. Posting it on the board means it gets answered once
          and read by everyone — and you will usually hear back faster, because your
          classmates answer too, not just us.</p>
        <p class="private-nudge">If you are about to ask something another student
          could learn from, please put it on the board.</p>
        <button class="btn primary" id="private-to-board">Go to the community</button>
      </section>` : ''}

      <section class="card private-chat">
        <h2>Something private?</h2>
        <p>If it is personal — your own circumstances, something you would rather
          not put in front of the class, or anything to do with your account or
          payment — use the chat at the bottom of this page. It comes straight to
          us and nobody else sees it.</p>
        <p class="private-wait"><strong>Please allow up to 48 hours for a reply.</strong>
          We read everything, but we are teaching for a good part of the week.</p>
        <p class="muted small">Anything about a deadline you have already missed is
          worth sending here rather than waiting — say what happened and we will sort
          it out with you.</p>
      </section>
    </div>`;
}

/* The widget belongs to this screen and nowhere else.
   ------------------------------------------------------------------
   It is a third-party script, and a third-party script can read whatever is on
   the page it is running on. This is the one screen with nothing on it — no
   submissions, no feedback, no other student's name — so it is loaded when the
   screen opens and taken away again when it closes, rather than sitting on every
   page of the portal for the whole session. */
const CHAT_WIDGET_ID = '6a97b99f783fa37794030a49';

function mountChatWidget() {
  if (document.getElementById('gg-chat-widget')) return;
  const script = document.createElement('script');
  script.id = 'gg-chat-widget';
  script.src = 'https://widgets.leadconnectorhq.com/loader.js';
  script.dataset.resourcesUrl = 'https://widgets.leadconnectorhq.com/chat-widget/loader.js';
  script.dataset.widgetId = CHAT_WIDGET_ID;
  document.body.append(script);
}

function unmountChatWidget() {
  document.getElementById('gg-chat-widget')?.remove();
  /* The loader draws its own furniture outside our markup, so removing the
     script alone leaves the bubble floating over every other screen. */
  document.querySelectorAll('[id^="lc_text-widget"], [class*="lc_text-widget"], chat-widget')
    .forEach((node) => node.remove());
}

function studentTabs(active) {
  return `<div class="tabs">
    <div class="tab-group"><button class="tab ${active === 'calendar' ? 'active' : ''}" data-student-view="calendar">Calendar</button><button class="tab ${active === 'tracker' ? 'active' : ''}" data-student-view="tracker">My weekly tracker</button></div>
  </div>`;
}

const WITHDRAWAL_REASONS = [
  'Not enough time alongside work or family',
  'The course was not what I expected',
  'It moved too fast for me',
  'It moved too slowly for me',
  'Cost',
  'Health or personal reasons',
  'I got what I needed and I am finished',
  'Something else',
];

/* The withdrawal form. One page rather than the rolling format used elsewhere:
   somebody leaving should not be walked through eight separate screens. Only the
   first question is required — every other answer is a favour they are doing us. */
function openWithdrawalForm() {
  const scale = (name, label) => `<div class="form-field"><label>${label}</label>
    <div class="rating-row">${[1,2,3,4,5].map((value) => `<button type="button" class="rating" data-rating="${name}" data-value="${value}">${value}</button>`).join('')}
    <span class="muted small">1 poor · 5 excellent</span></div></div>`;

  modal({
    title: 'Course withdrawal form',
    subtitle: 'Only the first question is required.',
    wide: true,
    body: `<div class="withdrawal-form">
      <div class="form-field"><label for="wd-reason">What is the main reason you are leaving?</label>
        <select id="wd-reason">${WITHDRAWAL_REASONS.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('')}</select></div>
      <div class="form-field"><label for="wd-detail">Anything you would like to add?</label>
        <textarea id="wd-detail" placeholder="Optional. It stays between you and Gaeilgeoir Guides."></textarea></div>

      <div class="section-title">How was the course?</div>
      ${scale('overall', 'Overall')}
      ${scale('teaching', 'The teaching')}
      ${scale('materials', 'The materials and homework')}

      <div class="form-field"><label for="wd-pace">How was the pace?</label>
        <select id="wd-pace"><option value="">Prefer not to say</option><option>Too slow</option><option>About right</option><option>Too fast</option></select></div>
      <div class="form-field"><label for="wd-worked">What worked well for you?</label><textarea id="wd-worked" placeholder="Optional"></textarea></div>
      <div class="form-field"><label for="wd-improve">What would you change?</label><textarea id="wd-improve" placeholder="Optional"></textarea></div>
      <div class="form-field"><label for="wd-recommend">Would you recommend Gaeilgeoir Guides to someone else?</label>
        <select id="wd-recommend"><option value="">Prefer not to say</option><option>Yes</option><option>Maybe</option><option>No</option></select></div>
      <label class="toggle-row"><span class="toggle"><input id="wd-contact" type="checkbox"><span></span></span>Éamon may contact me about my answers</label>

      <div class="error-banner stack-top">Submitting this ends your place on the course. Reminders and new homework stop, and everything you have already done stays in your account.</div>
    </div>`,
    footer: `<button class="btn" data-close-modal>Cancel</button><button class="btn danger" id="wd-submit">Submit and withdraw</button>`,
    onOpen() {
      const ratings = {};
      modalRoot.querySelectorAll('[data-rating]').forEach((button) => button.addEventListener('click', () => {
        ratings[button.dataset.rating] = Number(button.dataset.value);
        modalRoot.querySelectorAll(`[data-rating="${button.dataset.rating}"]`).forEach((peer) => {
          peer.classList.toggle('selected', Number(peer.dataset.value) <= Number(button.dataset.value));
        });
      }));
      document.getElementById('wd-submit').addEventListener('click', async (event) => {
        if (!await askConfirm({ title: 'Submit the withdrawal form?', message: 'This ends your place on the course. Reminders and new homework stop. Everything you have already done stays in your account.', confirmLabel: 'Submit and withdraw', danger: true })) return;
        const button = event.currentTarget;
        button.disabled = true; button.textContent = 'Submitting…';
        try {
          await api('/api/student/withdrawal', { method: 'POST', body: {
            reason: document.getElementById('wd-reason').value,
            detail: document.getElementById('wd-detail').value,
            overallRating: ratings.overall,
            teachingRating: ratings.teaching,
            materialsRating: ratings.materials,
            pace: document.getElementById('wd-pace').value,
            whatWorked: document.getElementById('wd-worked').value,
            whatToImprove: document.getElementById('wd-improve').value,
            wouldRecommend: document.getElementById('wd-recommend').value,
            mayContact: document.getElementById('wd-contact').checked,
          } });
          closeModal();
          state.studentData = await api('/api/student/bootstrap');
          renderStudent();
          modal({
            title: 'Thank you',
            body: '<div class="success-banner">Your withdrawal has been recorded. You will not receive any more reminders, and no further work is expected.</div><p class="muted small">Everything you submitted and every piece of feedback stays in your account. Go raibh míle maith agat, and the best of luck with the Gaeilge.</p>',
            footer: '<button class="btn primary" data-close-modal>Close</button>',
          });
        } catch (error) {
          showToast(error.message, 'error');
          button.disabled = false; button.textContent = 'Submit and withdraw';
        }
      });
    },
  });
}

function bindStudentView() {
  document.querySelectorAll('[data-open-student-item]').forEach((button) => button.addEventListener('click', () => openStudentItem(button.dataset)));
  document.querySelectorAll('[data-open-class]').forEach((button) =>
    button.addEventListener('click', () => openClassInfo(button.dataset.openClass, button.dataset.classKind)));
  document.querySelectorAll('[data-dismiss]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const title = button.closest('.deadline-card')?.querySelector('strong')?.textContent || 'It';
    dismissDeadline(button.dataset.dismiss, button.dataset.ref, title);
  }));
  document.querySelectorAll('[data-calendar-step]').forEach((button) => button.addEventListener('click', () => {
    const step = Number(button.dataset.calendarStep);
    if (!step) {
      state.calendarMonth = null;
    } else {
      const cursor = state.calendarMonth ? new Date(state.calendarMonth) : new Date();
      state.calendarMonth = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1).toISOString();
    }
    renderStudent();
  }));
  document.getElementById('change-password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') } }); showToast('Password changed'); event.currentTarget.reset(); }
    catch (error) { showToast(error.message, 'error'); }
  });
  document.getElementById('new-password')?.addEventListener('input', (event) => updatePasswordRules(event.target.value));
  document.getElementById('student-logout')?.addEventListener('click', logout);
  document.getElementById('open-withdrawal')?.addEventListener('click', openWithdrawalForm);
  bindFeed();
}

function openStudentItem(dataset) {
  const maps = studentMaps();
  if (dataset.openStudentItem === 'checkin') {
    const week = state.studentData.weeks.find((item) => item.id === dataset.weekId);
    const checkin = maps.checkins.get(week.id);
    if (checkin?.status === 'returned') return showCheckinFeedback(checkin, week);
    if (checkin?.status === 'submitted') return modal({
      title: 'Your check-in',
      subtitle: `Week of ${fmtWeek(week.week_start)}`,
      body: `<div class="success-banner">Submitted. Your teacher will reply here.</div>${submittedCheckinBlock(checkin)}`,
      footer: '<button class="btn primary" data-close-modal>Done</button>',
    });
    if (Date.now() > new Date(week.checkin_due_at).getTime()) return showToast('This check-in deadline has passed', 'error');
    openCheckinForm(week, checkin);
  } else {
    const assignment = state.studentData.assignments.find((item) => item.id === dataset.assignmentId);
    const submission = maps.homework.get(assignment.id);
    if (submission?.status === 'returned') return showHomeworkFeedback(submission, assignment);
    if (submission?.status === 'submitted') return modal({
      title: 'Your homework',
      subtitle: assignment.title,
      wide: true,
      body: `<div class="success-banner">Submitted. Your teacher will return corrections and feedback here.</div>${submittedHomeworkBlock(assignment, submission)}`,
      footer: '<button class="btn primary" data-close-modal>Done</button>',
    });
    openHomeworkForm(assignment, submission);
  }
}

const checkinQuestions = [
  { key: 'attendance', text: "Did you attend or watch this week's class?", type: 'choice', required: true, options: ['I attended live', 'I watched the recording', 'Not yet'] },
  { key: 'reviewed', text: "Did you review this week's material?", type: 'choice', required: true, options: ['Yes', 'No'] },
  { key: 'understanding', text: 'How well do you understand this week’s material?', type: 'scale', required: true },
  { key: 'confidence', text: 'How confident are you feeling right now?', type: 'scale', required: true },
  { key: 'weeklyWin', text: "What's your weekly win?", description: 'Anything big or small to do with Irish.', type: 'text', required: true },
  { key: 'support', text: 'Is there anything you are struggling with or need help with?', type: 'text', required: false },
];

function openCheckinForm(week, existing) {
  state.checkinForm = { week, step: 0, answers: { ...(existing?.answers || {}) } };
  renderCheckinStep();
}

function renderCheckinStep() {
  const form = state.checkinForm;
  const question = checkinQuestions[form.step];
  const answer = form.answers[question.key];
  let input = '';
  if (question.type === 'choice') input = `<div class="choice-list">${question.options.map((option) => `<button class="choice ${answer === option ? 'selected' : ''}" data-checkin-choice="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join('')}</div>`;
  else if (question.type === 'scale') input = `<div class="scale-list">${Array.from({ length: 10 }, (_, index) => index + 1).map((value) => `<button class="scale ${answer === value ? 'selected' : ''}" data-checkin-scale="${value}">${value}</button>`).join('')}</div>`;
  else input = `<textarea id="checkin-text" placeholder="${question.required ? 'Type your answer' : 'Optional'}">${escapeHtml(answer || '')}</textarea>`;
  modal({
    title: 'Weekly check-in', subtitle: `Week of ${fmtWeek(form.week.week_start)}`,
    body: `<div class="rolling-form"><div class="progress"><span style="width:${((form.step + 1) / checkinQuestions.length) * 100}%"></span></div><div class="rolling-stage"><div class="rolling-kicker">Question ${form.step + 1} of ${checkinQuestions.length}</div><div class="rolling-question">${escapeHtml(question.text)}</div>${question.description ? `<div class="required-note">${escapeHtml(question.description)}</div>` : `<div class="required-note">${question.required ? 'Required' : 'Optional'}</div>`}${input}<div id="rolling-error"></div></div><div class="rolling-footer"><button class="btn" id="checkin-back" ${form.step === 0 ? 'disabled' : ''}>Back</button><span class="save-indicator">Drafts save automatically</span><button class="btn primary" id="checkin-next">${form.step === checkinQuestions.length - 1 ? 'Submit check-in' : 'Save and continue'}</button></div></div>`,
    onOpen() {
      document.querySelectorAll('[data-checkin-choice]').forEach((button) => button.addEventListener('click', () => { form.answers[question.key] = button.dataset.checkinChoice; saveCheckinDraft(); renderCheckinStep(); }));
      document.querySelectorAll('[data-checkin-scale]').forEach((button) => button.addEventListener('click', () => { form.answers[question.key] = Number(button.dataset.checkinScale); saveCheckinDraft(); renderCheckinStep(); }));
      document.getElementById('checkin-text')?.addEventListener('input', debounce((event) => { form.answers[question.key] = event.target.value; saveCheckinDraft(); }, 500));
      document.getElementById('checkin-back').addEventListener('click', () => { captureCheckinText(question); if (form.step > 0) { form.step -= 1; renderCheckinStep(); } });
      document.getElementById('checkin-next').addEventListener('click', async () => {
        captureCheckinText(question);
        if (question.required && !String(form.answers[question.key] ?? '').trim()) {
          document.getElementById('rolling-error').innerHTML = '<div class="error-banner" style="margin-top:10px">Please answer this question.</div>'; return;
        }
        await saveCheckinDraft();
        if (form.step < checkinQuestions.length - 1) { form.step += 1; renderCheckinStep(); }
        else submitCheckin();
      });
    },
  });
}

function captureCheckinText(question) {
  const input = document.getElementById('checkin-text');
  if (input) state.checkinForm.answers[question.key] = input.value.trim();
}

async function saveCheckinDraft() {
  if (!state.checkinForm) return;
  try { await api(`/api/student/checkins/${state.checkinForm.week.id}/draft`, { method: 'PUT', body: { answers: state.checkinForm.answers } }); }
  catch (error) { console.error(error); }
}

async function submitCheckin() {
  /* Pressing Submit used to do nothing visible for as long as two requests took,
     then blank the form, then produce a celebration. Three moments where there
     should be one.

     The button says what is happening straight away, the confetti fires the
     instant the work is accepted rather than after the page has caught up, and
     the form is replaced by the celebration rather than closed and followed by
     it — no gap, no flash of the screen underneath. */
  const button = document.getElementById('checkin-next');
  const label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Sending…'; }

  try {
    await api(`/api/student/checkins/${state.checkinForm.week.id}/submit`, { method: 'POST', body: { answers: state.checkinForm.answers } });
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = label; }
    return showToast(error.message, 'error');
  }

  // It is in. Say so before anything else is waited on.
  celebrate();
  state.studentData = await api('/api/student/bootstrap');
  renderStudent();
  const progress = studentProgress();
  celebrationScreen({
    title: 'Check-in sent. Maith thú!',
    line: 'Your teacher will read it and come back to you in your weekly tracker.',
    progress, milestone: progress.justHit, alreadyCelebrated: true,
  });
  /* A milestone earns a second burst, now that we know there was one. */
  if (progress.justHit) celebrate({ big: true });
}

async function openHomeworkForm(assignment, submission) {
  try {
    const data = await api(`/api/student/assignments/${assignment.id}`);
    /* A hard deadline that has passed closes the assignment outright. The
       questions do not come back from the server, and offering an empty form
       behind a refusal would be worse than saying so. */
    if (!data.assignment.open) return closedAssignmentNotice(data.assignment, data.submission);
    state.homeworkForm = { assignment: data.assignment, submission: data.submission, step: data.submission?.current_question || 0, answers: Array.isArray(data.submission?.answers) ? [...data.submission.answers] : data.assignment.questions.map(() => ''), files: data.submission?.files || [] };
    renderHomeworkStep();
  } catch (error) { showToast(error.message, 'error'); }
}

/* What a student sees when a hard deadline has gone. Their own work, if they
   submitted, and otherwise the plain fact of it. */
function closedAssignmentNotice(assignment, submission) {
  const submitted = submission && submission.status !== 'draft';
  modal({
    title: assignment.title,
    subtitle: `Closed ${fmtDate(assignment.deadline_at, { weekday: true, time: true, dateStyle: 'medium' })}`,
    body: submitted
      ? `<div class="closed-note is-in">
           <strong>You handed this in.</strong>
           <span>The deadline has since passed, so it can no longer be changed.</span>
         </div>
         ${submittedHomeworkBlock(assignment, submission)}`
      : `<div class="closed-note">
           <strong>This deadline has passed.</strong>
           <span>It was a hard deadline, so the assignment is closed and cannot be submitted now. If you need it reopened, ask in the community or reply to your feedback email.</span>
         </div>`,
    footer: '<button class="btn primary" data-close-modal>Close</button>',
  });
}

function loomEmbed(url) {
  if (!url) return '';
  const match = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (!match) return `<a class="btn small" target="_blank" rel="noopener" href="${escapeHtml(url)}">Open Loom video</a>`;
  return `<iframe title="Assignment video" src="https://www.loom.com/embed/${match[1]}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin-bottom:14px" allowfullscreen></iframe>`;
}

function renderHomeworkStep() {
  const form = state.homeworkForm, assignment = form.assignment, question = assignment.questions[form.step];
  modal({
    title: assignment.title, subtitle: `Due ${fmtDate(assignment.reopened_until || assignment.deadline_at, { time: true })}`, wide: true,
    body: `<div class="rolling-form"><div class="progress"><span style="width:${((form.step + 1) / assignment.questions.length) * 100}%"></span></div><div class="rolling-stage">${form.step === 0 ? loomEmbed(assignment.loom_url) : ''}${form.step === 0 && assignment.resources.length ? `<div style="margin-bottom:14px">${assignment.resources.map((resource) => `<a class="resource-chip" target="_blank" rel="noopener" href="${escapeHtml(resource.fileUrl || resource.file_url)}">📎 ${escapeHtml(resource.fileName || resource.file_name)}</a>`).join('')}</div>` : ''}<div class="rolling-kicker">Question ${form.step + 1} of ${assignment.questions.length}</div><div class="rolling-question">${escapeHtml(question.prompt)}</div>${question.imageUrl ? `<img src="${escapeHtml(question.imageUrl)}" alt="" style="max-width:100%;max-height:260px;border-radius:10px;margin-bottom:13px">` : ''}<div class="required-note">${question.required ? 'Required' : 'Optional'}</div><textarea id="homework-answer" placeholder="Type your answer">${escapeHtml(form.answers[form.step] || '')}</textarea>${form.step === assignment.questions.length - 1 ? homeworkUploadPanel(assignment, form) : ''}<div id="rolling-error"></div></div><div class="rolling-footer"><button class="btn" id="homework-exit">Back to deadlines</button><div><button class="btn" id="homework-back" ${form.step === 0 ? 'disabled' : ''}>Previous</button> <button class="btn primary" id="homework-next">${form.step === assignment.questions.length - 1 ? 'Submit homework' : 'Save and continue'}</button></div></div></div>`,
    onOpen() {
      const answer = document.getElementById('homework-answer');
      bindHomeworkUploads();
      answer.addEventListener('input', debounce(() => { form.answers[form.step] = answer.value; saveHomeworkDraft(); }, 500));
      document.getElementById('homework-exit').addEventListener('click', async () => { form.answers[form.step] = answer.value; await saveHomeworkDraft(); closeModal(); });
      document.getElementById('homework-back').addEventListener('click', async () => { form.answers[form.step] = answer.value; await saveHomeworkDraft(); if (form.step > 0) { form.step -= 1; renderHomeworkStep(); } });
      document.getElementById('homework-next').addEventListener('click', async () => {
        form.answers[form.step] = answer.value.trim();
        if (question.required && !form.answers[form.step]) { document.getElementById('rolling-error').innerHTML = '<div class="error-banner" style="margin-top:10px">Please answer this question.</div>'; return; }
        await saveHomeworkDraft();
        if (form.step < assignment.questions.length - 1) { form.step += 1; renderHomeworkStep(); }
        else submitHomework();
      });
    },
  });
}

const FILE_TYPE_ACCEPT = {
  image: '.jpg,.jpeg,.png,.webp,.heic,.heif',
  pdf: '.pdf',
  word: '.docx',
  text: '.txt',
};
const FILE_TYPE_NAMES = { image: 'photos', pdf: 'PDFs', word: 'Word documents', text: 'text files' };

function fmtBytes(bytes) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* Where a student hands work up. Only shown when the teacher turned uploads on
   for this assignment, and only accepting the formats they chose. */
function homeworkUploadPanel(assignment, form) {
  if (!assignment.allow_uploads) return '';
  const types = assignment.accepted_file_types || [];
  const files = form.files || [];
  const accept = types.map((type) => FILE_TYPE_ACCEPT[type]).filter(Boolean).join(',');
  const names = types.map((type) => FILE_TYPE_NAMES[type]).filter(Boolean);
  const full = files.length >= (assignment.max_files || 3);

  return `<div class="upload-panel" id="upload-panel">
    <div class="upload-panel-head">
      <strong>${assignment.uploads_required ? 'Upload your work' : 'Upload your work, optional'}</strong>
      <span class="muted small">${names.length ? `Takes ${names.join(', ')}` : ''} · up to ${assignment.max_files || 3} file${(assignment.max_files || 3) === 1 ? '' : 's'}</span>
    </div>
    <div class="upload-list" id="upload-list">${files.map((file) => `
      <div class="upload-item">
        <span class="upload-name">${escapeHtml(file.fileName)}</span>
        <span class="upload-meta">${escapeHtml(fmtBytes(file.sizeBytes))}${file.extractionState === 'done' ? ' · read' : file.extractionState === 'failed' ? ' · could not be read automatically' : ''}</span>
        <button type="button" class="text-link" data-remove-file="${file.id}">Remove</button>
      </div>`).join('') || '<div class="muted small">Nothing uploaded yet.</div>'}</div>
    ${full ? `<div class="muted small">That is the maximum for this assignment.</div>`
      : `<label class="upload-drop"><input type="file" id="homework-file" accept="${escapeHtml(accept)}" hidden>
          <span>${svg.upload} Choose a file</span>
          <small>A photo of handwritten work is grand. It is read automatically so your teacher can correct it.</small>
        </label>`}
    <div class="upload-status" id="upload-status"></div>
  </div>`;
}

async function bindHomeworkUploads() {
  const input = document.getElementById('homework-file');
  const status = document.getElementById('upload-status');
  const form = state.homeworkForm;

  document.querySelectorAll('[data-remove-file]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/api/student/files/${button.dataset.removeFile}`, { method: 'DELETE' });
      form.files = (form.files || []).filter((file) => file.id !== button.dataset.removeFile);
      renderHomeworkStep();
    } catch (error) { showToast(error.message, 'error'); }
  }));

  input?.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    status.textContent = 'Uploading and reading your work…';
    status.className = 'upload-status busy';
    try {
      const body = new FormData();
      body.append('file', file, file.name);
      const uploaded = await api(`/api/student/assignments/${form.assignment.id}/files`, { method: 'POST', body });
      form.files = [...(form.files || []), uploaded];
      renderHomeworkStep();
      showToast(uploaded.extractionState === 'done' ? 'Uploaded and read' : 'Uploaded. Your teacher will read it themselves.');
    } catch (error) {
      status.textContent = error.message;
      status.className = 'upload-status error';
    }
  });
}

async function saveHomeworkDraft() {
  const form = state.homeworkForm;
  if (!form) return;
  try { await api(`/api/student/assignments/${form.assignment.id}/draft`, { method: 'PUT', body: { answers: form.answers, currentQuestion: form.step } }); }
  catch (error) { console.error(error); }
}

async function submitHomework() {
  // Same shape as the check-in, and for the same reason: handing work in should
  // be one moment, not a silence followed by a blank screen followed by a party.
  const form = state.homeworkForm;
  const button = document.getElementById('homework-next');
  const label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Sending…'; }

  try {
    await api(`/api/student/assignments/${form.assignment.id}/submit`, { method: 'POST', body: { answers: form.answers } });
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = label; }
    return showToast(error.message, 'error');
  }

  celebrate();
  state.studentData = await api('/api/student/bootstrap');
  renderStudent();
  const progress = studentProgress();
  celebrationScreen({
    title: 'Homework in. Go hiontach!',
    line: 'Corrections and feedback will appear in your weekly tracker once your teacher has been through it.',
    progress, milestone: progress.justHit, alreadyCelebrated: true,
  });
  if (progress.justHit) celebrate({ big: true });
}

async function showCheckinFeedback(checkin, week) {
  const wasUnread = !checkin.feedback_read_at;
  await api(`/api/student/checkins/${checkin.id}/read-feedback`, { method: 'POST' }).catch(() => {});
  checkin.feedback_read_at = new Date().toISOString();
  if (wasUnread) {
    state.studentData.notifications = Math.max(0, state.studentData.notifications - 1);
    renderStudent();
  }
  const written = checkin.teacher_feedback || checkin.ai_feedback || '';
  modal({
    title: 'Your check-in feedback',
    subtitle: `Week of ${fmtWeek(week.week_start)}`,
    body: `${studentVoiceNote(checkin.voice_note)}
      ${written ? `<div class="section-title">Feedback from your teacher</div><div class="feedback-box"><h3>✓ Feedback returned</h3><p>${escapeHtml(written)}</p></div>` : ''}
      ${submittedCheckinBlock(checkin)}`,
    footer: '<button class="btn primary" data-close-modal>Done</button>',
  });
}

async function showHomeworkFeedback(submission, assignment) {
  const wasUnread = !submission.feedback_read_at;
  await api(`/api/student/homework/${submission.id}/read-feedback`, { method: 'POST' }).catch(() => {});
  submission.feedback_read_at = new Date().toISOString();
  if (wasUnread) {
    state.studentData.notifications = Math.max(0, state.studentData.notifications - 1);
    renderStudent();
  }
  const corrections = submission.teacher_corrections || submission.ai_corrections || '';
  const general = submission.teacher_general_feedback || submission.ai_general_feedback || '';
  modal({
    title: assignment.title,
    subtitle: 'Feedback from your teacher',
    wide: true,
    body: `${studentVoiceNote(submission.voice_note)}
      ${corrections ? `<div class="section-title">Irish corrections</div><div class="answer-box corrections">${escapeHtml(corrections)}</div>` : ''}
      ${general ? `<div class="section-title">General feedback</div><div class="feedback-box"><h3>✓ Feedback returned</h3><p>${escapeHtml(general)}</p></div>` : ''}
      ${submittedHomeworkBlock(assignment, submission)}`,
    footer: '<button class="btn primary" data-close-modal>Done</button>',
  });
}

const CHECKIN_LABELS = {
  attendance: "Did you attend or watch this week's class?",
  reviewed: "Did you review this week's material?",
  understanding: 'How well do you understand this week’s material?',
  confidence: 'How confident are you feeling?',
  weeklyWin: "What's your weekly win?",
  support: 'Anything you are struggling with?',
};

/* A student's own answers, read back to them. Once something is handed in the
   first thing anyone wants to know is what they actually said. */
function submittedCheckinBlock(checkin) {
  const answers = checkin?.answers || {};
  const rows = [
    ['attendance', answers.attendance],
    ['reviewed', answers.reviewed],
    ['understanding', answers.understanding ? `${answers.understanding}/10` : ''],
    ['confidence', answers.confidence ? `${answers.confidence}/10` : ''],
    ['weeklyWin', answers.weeklyWin],
    ['support', answers.support],
  ].filter(([, value]) => String(value ?? '').trim());
  if (!rows.length) return '';
  return `<div class="section-title">What you sent</div>
    <div class="my-answers">${rows.map(([key, value]) => `<div class="my-answer">
      <small>${escapeHtml(CHECKIN_LABELS[key] || key)}</small>
      <p>${escapeHtml(String(value))}</p>
    </div>`).join('')}</div>`;
}

function submittedHomeworkBlock(assignment, submission) {
  const answers = Array.isArray(submission?.answers) ? submission.answers : [];
  const questions = assignment?.questions || [];
  const files = submission?.files || [];
  if (!questions.length && !files.length) return '';
  return `<div class="section-title">What you sent</div>
    <div class="my-answers">${questions.map((question, index) => `<div class="my-answer">
      <small>${escapeHtml(question.prompt)}</small>
      <p>${escapeHtml(answers[index] || 'You left this one blank.')}</p>
    </div>`).join('')}
    ${files.length ? `<div class="my-answer">
      <small>Files you uploaded</small>
      <div class="my-files">${files.map((file) => `<a class="btn small" href="/api/media/homework-file/${file.id}" target="_blank" rel="noopener">${svg.book} ${escapeHtml(file.fileName)}</a>`).join('')}</div>
    </div>` : ''}</div>`;
}

function studentVoiceNote(note) {
  if (!note) return '';
  return `<div class="voice-note-card student">
    <div class="voice-note-head"><span class="voice-note-title">${svg.mic} Voice note from your teacher</span><span class="muted small">${fmtDuration(note.seconds)}</span></div>
    <div class="voice-note-body"><div class="voice-player"><audio controls preload="metadata" src="${escapeHtml(note.url)}"></audio></div></div>
  </div>`;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

/* Bootstrap */
async function loadApplication() {
  if (state.user.role === 'admin') await loadAdmin();
  else await loadStudent();
}

async function boot() {
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    if (state.user.mustChangePassword) renderAuth('change');
    else if (state.user.mustSetAvatar && !state.user.hasAvatar) renderAuth('avatar');
    else await loadApplication();
  } catch {
    renderAuth(new URLSearchParams(location.search).has('reset') ? 'reset' : 'login');
  }
}

boot();
