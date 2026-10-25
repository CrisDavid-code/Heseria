/**
 * HESERIA — Domain types.
 * These types are the contract between UI and services. When the real backend
 * arrives, only the service implementations change; these types stay.
 */

export type ID = string;

export type Role =
  | "visitor"
  | "user"
  | "member"
  | "server"
  | "leader"
  | "youth_leader"
  | "teacher"
  | "musician"
  | "artist"
  | "pastor"
  | "missionary"
  | "creator"
  | "church_admin"
  | "moderator"
  | "admin";

export type Permission =
  | "canView"
  | "canCreate"
  | "canEdit"
  | "canDelete"
  | "canManage"
  | "canModerate"
  | "canPublish"
  | "canManageChurch"
  | "canManageCourses"
  | "canManageFoundation";

export interface User {
  id: ID;
  firstName: string;
  lastName: string;
  name: string;
  handle: string;
  email: string;
  role: Role;
  bio: string;
  city: string;
  country: string;
  churchId?: ID;
  ministries: string[];
  interests: string[];
  followers: number;
  following: number;
  joinedAt: string;
  color: string;
  avatarUrl?: string;
  /** Imagen de portada del perfil. */
  coverUrl?: string;
  /** ¿Ya pasó por la personalización inicial? */
  onboarded?: boolean;
  status?: string;
}

export interface Church {
  id: ID;
  name: string;
  denomination: string;
  city: string;
  country: string;
  language: string;
  description: string;
  members: number;
  services: { day: string; time: string; type: string }[];
  ministries: ID[];
  pastorId: ID;
  contact: { email: string; phone: string; site: string };
  color: string;
  /** Kilómetros desde donde estás. `null` cuando aún no hay GPS. */
  distanceKm: number | null;
  /** Dónde está la congregación, para pintarla en el mapa. */
  lat?: number;
  lng?: number;
}

export interface Ministry {
  id: ID;
  name: string;
  category: string;
  churchId: ID;
  leaderId: ID;
  description: string;
  members: number;
  color: string;
}

export interface Artist {
  id: ID;
  name: string;
  genre: string;
  country: string;
  bio: string;
  monthlyListeners: number;
  color: string;
}

export interface Album {
  id: ID;
  title: string;
  artistId: ID;
  year: number;
  trackIds: ID[];
  color: string;
}

export interface Song {
  id: ID;
  title: string;
  artistId: ID;
  albumId: ID;
  durationSec: number;
  genre: string;
  plays: number;
  color: string;
  audioUrl?: string;
  demoMedia?: boolean;
}

export interface Playlist {
  id: ID;
  title: string;
  description: string;
  ownerId: ID;
  trackIds: ID[];
  color: string;
}

export interface PodcastEpisode {
  audioUrl?: string;
  id: ID;
  title: string;
  description: string;
  durationSec: number;
  publishedAt: string;
}

export interface Podcast {
  id: ID;
  title: string;
  host: string;
  category: string;
  description: string;
  episodes: PodcastEpisode[];
  color: string;
}

export interface Sermon {
  id: ID;
  title: string;
  preacherId: ID;
  churchId: ID;
  durationSec: number;
  description: string;
  passage: string;
  topics: string[];
  publishedAt: string;
  views: number;
  chapters: { title: string; atSec: number }[];
  color: string;
  audioUrl?: string;
  videoUrl?: string;
  demoMedia?: boolean;
}

export interface Video {
  id: ID;
  title: string;
  authorId: ID;
  category: string;
  description: string;
  durationSec: number;
  views: number;
  publishedAt: string;
  color: string;
  videoUrl?: string;
  demoMedia?: boolean;
}

export interface Movie {
  id: ID;
  title: string;
  year: number;
  genre: string;
  synopsis: string;
  durationMin: number;
  rating: string;
  cast: string[];
  director: string;
  color: string;
  videoUrl?: string;
  demoMedia?: boolean;
}

export interface SeriesEpisode {
  id: ID;
  number: number;
  title: string;
  durationMin: number;
  synopsis: string;
  videoUrl?: string;
}

export interface Series {
  id: ID;
  title: string;
  year: number;
  genre: string;
  synopsis: string;
  rating: string;
  seasons: { number: number; episodes: SeriesEpisode[] }[];
  color: string;
}

export interface Lesson {
  id: ID;
  title: string;
  durationMin: number;
  type: "video" | "reading" | "quiz" | "assignment";
  completed: boolean;
  videoUrl?: string;
  /** Pasaje a leer dentro de la app: `{ book: "juan", chapter: 3 }`. */
  passage?: { book: string; chapter: number };
  /** Enseñanza de la lección, en párrafos. */
  body?: string[];
  /** Preguntas para estudiar en grupo o a solas. */
  questions?: string[];
}

export interface CourseModule {
  id: ID;
  title: string;
  lessons: Lesson[];
}

export interface Course {
  id: ID;
  title: string;
  instructorId: ID;
  category: string;
  level: "Inicial" | "Intermedio" | "Avanzado";
  modality: "Online" | "Presencial" | "Híbrido";
  description: string;
  requirements: string[];
  students: number;
  rating: number;
  durationHours: number;
  certificate: boolean;
  progress: number;
  modules: CourseModule[];
  city?: string;
  color: string;
}

export interface Devotional {
  id: ID;
  title: string;
  authorId: ID;
  date: string;
  minutes: number;
  verse: { ref: string; text: string };
  reflection: string[];
  prayer: string;
  topics: string[];
  completed: boolean;
  color: string;
}

export interface PlanDay {
  day: number;
  title: string;
  passage: string;
  task: string;
  done: boolean;
}

export interface Plan {
  id: ID;
  title: string;
  category: string;
  description: string;
  days: PlanDay[];
  participants: number;
  progress: number;
  color: string;
}

export interface PrayerRequest {
  id: ID;
  authorId: ID;
  title: string;
  body: string;
  category: string;
  visibility: "public" | "private" | "church";
  prayingCount: number;
  answered: boolean;
  createdAt: string;
  testimony?: string;
}

export interface Event {
  id: ID;
  title: string;
  churchId?: ID;
  type: string;
  modality: "Presencial" | "Online" | "Híbrido";
  date: string;
  time: string;
  city: string;
  venue: string;
  description: string;
  attendees: number;
  capacity: number;
  color: string;
}

export interface Group {
  id: ID;
  name: string;
  churchId: ID;
  topic: string;
  description: string;
  members: ID[];
  privacy: "Abierto" | "Cerrado";
  meeting: string;
  color: string;
}

export interface Comment {
  id: ID;
  authorId: ID;
  body: string;
  createdAt: string;
  likes: number;
}

export type PostType =
  | "texto"
  | "imagen"
  | "video"
  | "oración"
  | "testimonio"
  | "reflexión"
  | "anuncio"
  | "evento";

export interface Post {
  id: ID;
  authorId: ID;
  type: PostType;
  body: string;
  createdAt: string;
  likes: number;
  comments: Comment[];
  /** Cuántos comentarios tiene, aunque no se hayan cargado. */
  commentCount?: number;
  /** Foto de la publicación, ya comprimida (data URL). */
  image?: string;
  shares: number;
  groupId?: ID;
  hashtags: string[];
  color: string;
}

/** Un archivo que viaja con un mensaje. */
export interface MessageAttachment {
  id: ID;
  title: string;
  name: string;
  mime: string;
  size: number;
  viewUrl: string;
  downloadUrl: string;
}

export interface Message {
  id: ID;
  conversationId: ID;
  authorId: ID;
  body: string;
  createdAt: string;
  kind: "text" | "image" | "voice" | "audio" | "video" | "file";
  /** El archivo adjunto, si lo hay. */
  attachment?: MessageAttachment | null;
  reactions: string[];
  pinned?: boolean;
  replyToId?: ID;
}

export interface Conversation {
  id: ID;
  kind: "direct" | "group";
  title: string;
  participantIds: ID[];
  lastMessageAt: string;
  unread: number;
  color: string;
}

export interface FoundationCase {
  id: ID;
  title: string;
  category: string;
  location: string;
  summary: string;
  situation: string;
  goal: number;
  raised: number;
  needs: string[];
  updates: { date: string; text: string }[];
  participants: number;
  urgent: boolean;
  color: string;
}

export interface VolunteerOpportunity {
  id: ID;
  title: string;
  caseId?: ID;
  location: string;
  modality: "Presencial" | "Online" | "Híbrido";
  date: string;
  skills: string[];
  slots: number;
  taken: number;
  description: string;
  color: string;
}

export interface Donation {
  id: ID;
  donorId: ID;
  amount: number;
  currency: string;
  frequency: "Única" | "Mensual" | "Anual";
  projectId: ID;
  createdAt: string;
  status: "Completada" | "Pendiente" | "Fallida";
}

export interface NotificationItem {
  id: ID;
  category: "mensajes" | "oración" | "comunidad" | "cursos" | "eventos" | "iglesia" | "sistema";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

export interface BibleVersion {
  id: ID;
  abbr: string;
  name: string;
  language: string;
  licensed: boolean;
  /** Aviso de derechos de autor que se muestra al leer. */
  copyright?: string;
}

export interface BibleBook {
  id: string;
  name: string;
  testament: "AT" | "NT";
  chapters: number;
}

export interface BibleVerse {
  number: number;
  text: string;
}

export interface BibleChapter {
  book: string;
  bookName: string;
  chapter: number;
  version: string;
  verses: BibleVerse[];
}

export interface ModerationItem {
  id: ID;
  kind: "contenido" | "imagen" | "video" | "comentario" | "perfil" | "mensaje";
  reportedBy: ID;
  targetId: ID;
  reason: string;
  excerpt: string;
  status: "pendiente" | "revisando" | "aprobado" | "rechazado" | "bloqueado";
  createdAt: string;
  severity: "baja" | "media" | "alta";
}

export interface AnalyticsSeriesPoint {
  label: string;
  value: number;
  secondary?: number;
}

export interface ContinueItem {
  id: ID;
  title: string;
  subtitle: string;
  progress: number;
  type: "movie" | "series" | "course" | "sermon" | "video" | "podcast";
  href: string;
  color: string;
}
