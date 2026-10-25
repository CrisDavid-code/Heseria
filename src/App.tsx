import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "@/layouts/AppShell";
import { AuthLayout } from "@/layouts/AuthLayout";
import { BootGate, RequireAuth, RequirePermission, RootRoute } from "@/layouts/Boot";
import { LoadingState } from "@/components/states";

/* Public */
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/auth/Login"));
const Register = lazy(() => import("@/pages/auth/Register"));
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword"));
const Feedback = lazy(() => import("@/pages/auth/Feedback"));
const Onboarding = lazy(() => import("@/pages/auth/Onboarding"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/* App */
const Home = lazy(() => import("@/pages/Home"));
const Explore = lazy(() => import("@/pages/Explore"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const BibleIndex = lazy(() => import("@/pages/bible/BibleIndex"));
const BibleChapter = lazy(() => import("@/pages/bible/BibleChapter"));
const DevotionalsList = lazy(() =>
  import("@/pages/growth/Devotionals").then((m) => ({ default: m.DevotionalsList })),
);
const DevotionalDetail = lazy(() =>
  import("@/pages/growth/Devotionals").then((m) => ({ default: m.DevotionalDetail })),
);
const PlansList = lazy(() => import("@/pages/growth/Plans").then((m) => ({ default: m.PlansList })));
const PlanDetail = lazy(() =>
  import("@/pages/growth/Plans").then((m) => ({ default: m.PlanDetail })),
);
const PrayerList = lazy(() =>
  import("@/pages/growth/Prayer").then((m) => ({ default: m.PrayerList })),
);
const PrayerNew = lazy(() => import("@/pages/growth/Prayer").then((m) => ({ default: m.PrayerNew })));

const music = () => import("@/pages/music/Music");
const MusicIndex = lazy(() => music().then((m) => ({ default: m.MusicIndex })));
const ArtistsList = lazy(() => music().then((m) => ({ default: m.ArtistsList })));
const ArtistDetail = lazy(() => music().then((m) => ({ default: m.ArtistDetail })));
const AlbumDetail = lazy(() => music().then((m) => ({ default: m.AlbumDetail })));
const PlaylistsList = lazy(() => music().then((m) => ({ default: m.PlaylistsList })));
const PlaylistDetail = lazy(() => music().then((m) => ({ default: m.PlaylistDetail })));

const podcasts = () => import("@/pages/media/Podcasts");
const PodcastsList = lazy(() => podcasts().then((m) => ({ default: m.PodcastsList })));
const PodcastDetail = lazy(() => podcasts().then((m) => ({ default: m.PodcastDetail })));

const podcastFeeds = () => import("@/pages/media/PodcastFeeds");
const PodcastFeedsList = lazy(() =>
  podcastFeeds().then((m) => ({ default: m.PodcastFeedsList })),
);
const PodcastFeedDetail = lazy(() =>
  podcastFeeds().then((m) => ({ default: m.PodcastFeedDetail })),
);

const sermons = () => import("@/pages/media/Sermons");
const SermonsList = lazy(() => sermons().then((m) => ({ default: m.SermonsList })));
const SermonDetail = lazy(() => sermons().then((m) => ({ default: m.SermonDetail })));

const videos = () => import("@/pages/media/Videos");
const VideosList = lazy(() => videos().then((m) => ({ default: m.VideosList })));
const VideoDetail = lazy(() => videos().then((m) => ({ default: m.VideoDetail })));



const academy = () => import("@/pages/academy/Academy");
const AcademyIndex = lazy(() => academy().then((m) => ({ default: m.AcademyIndex })));
const CoursesList = lazy(() => academy().then((m) => ({ default: m.CoursesList })));
const CourseDetail = lazy(() => academy().then((m) => ({ default: m.CourseDetail })));
const CourseLearn = lazy(() => academy().then((m) => ({ default: m.CourseLearn })));

const churchesMod = () => import("@/pages/community/Churches");
const ChurchesList = lazy(() => churchesMod().then((m) => ({ default: m.ChurchesList })));
const ChurchDetail = lazy(() => churchesMod().then((m) => ({ default: m.ChurchDetail })));
const MyChurch = lazy(() => churchesMod().then((m) => ({ default: m.MyChurch })));

const Community = lazy(() => import("@/pages/community/Community"));
const Messages = lazy(() => import("@/pages/community/Messages"));

const groupsMod = () => import("@/pages/community/Groups");
const GroupsList = lazy(() => groupsMod().then((m) => ({ default: m.GroupsList })));
const GroupDetail = lazy(() => groupsMod().then((m) => ({ default: m.GroupDetail })));

const eventsMod = () => import("@/pages/community/Events");
const EventsList = lazy(() => eventsMod().then((m) => ({ default: m.EventsList })));
const EventDetail = lazy(() => eventsMod().then((m) => ({ default: m.EventDetail })));
const MinistriesList = lazy(() => eventsMod().then((m) => ({ default: m.MinistriesList })));
const MinistryDetail = lazy(() => eventsMod().then((m) => ({ default: m.MinistryDetail })));

const Library = lazy(() => import("@/pages/personal/Library"));
const Notifications = lazy(() => import("@/pages/personal/Notifications"));
const Profile = lazy(() => import("@/pages/personal/Profile"));
const SettingsPage = lazy(() => import("@/pages/personal/Settings"));

const foundationMod = () => import("@/pages/foundation/Foundation");
const FoundationIndex = lazy(() => foundationMod().then((m) => ({ default: m.FoundationIndex })));
const FoundationCases = lazy(() => foundationMod().then((m) => ({ default: m.FoundationCases })));
const FoundationCaseDetail = lazy(() =>
  foundationMod().then((m) => ({ default: m.FoundationCaseDetail })),
);
const FoundationVolunteer = lazy(() =>
  foundationMod().then((m) => ({ default: m.FoundationVolunteer })),
);
const FoundationDonate = lazy(() => foundationMod().then((m) => ({ default: m.FoundationDonate })));

/* Management portals */
const ca = () => import("@/pages/admin/ChurchAdmin");
const ChurchAdminDashboard = lazy(() => ca().then((m) => ({ default: m.ChurchAdminDashboard })));
const ChurchAdminMembers = lazy(() => ca().then((m) => ({ default: m.ChurchAdminMembers })));
const ChurchAdminMemberDetail = lazy(() => ca().then((m) => ({ default: m.ChurchAdminMemberDetail })));
const ChurchAdminGroups = lazy(() => ca().then((m) => ({ default: m.ChurchAdminGroups })));
const ChurchAdminMinistries = lazy(() => ca().then((m) => ({ default: m.ChurchAdminMinistries })));
const ChurchAdminEvents = lazy(() => ca().then((m) => ({ default: m.ChurchAdminEvents })));
const ChurchAdminContent = lazy(() => ca().then((m) => ({ default: m.ChurchAdminContent })));
const ChurchAdminSermons = lazy(() => ca().then((m) => ({ default: m.ChurchAdminSermons })));
const ChurchAdminCourses = lazy(() => ca().then((m) => ({ default: m.ChurchAdminCourses })));
const ChurchAdminMessages = lazy(() => ca().then((m) => ({ default: m.ChurchAdminMessages })));
const ChurchAdminPrayer = lazy(() => ca().then((m) => ({ default: m.ChurchAdminPrayer })));
const ChurchAdminSettings = lazy(() => ca().then((m) => ({ default: m.ChurchAdminSettings })));

const te = () => import("@/pages/admin/Teacher");
const TeacherDashboard = lazy(() => te().then((m) => ({ default: m.TeacherDashboard })));
const TeacherCourses = lazy(() => te().then((m) => ({ default: m.TeacherCourses })));
const TeacherCourseNew = lazy(() => te().then((m) => ({ default: m.TeacherCourseNew })));
const TeacherCourseDetail = lazy(() => te().then((m) => ({ default: m.TeacherCourseDetail })));
const TeacherCourseEdit = lazy(() => te().then((m) => ({ default: m.TeacherCourseEdit })));
const TeacherStudents = lazy(() => te().then((m) => ({ default: m.TeacherStudents })));
const TeacherAssignments = lazy(() => te().then((m) => ({ default: m.TeacherAssignments })));
const TeacherEvaluations = lazy(() => te().then((m) => ({ default: m.TeacherEvaluations })));
const TeacherCertificates = lazy(() => te().then((m) => ({ default: m.TeacherCertificates })));
const TeacherAnalytics = lazy(() => te().then((m) => ({ default: m.TeacherAnalytics })));

const ac = () => import("@/pages/admin/ArtistCreator");
const ArtistDashboard = lazy(() => ac().then((m) => ({ default: m.ArtistDashboard })));
const ArtistMusic = lazy(() => ac().then((m) => ({ default: m.ArtistMusic })));
const ArtistAlbums = lazy(() => ac().then((m) => ({ default: m.ArtistAlbums })));
const ArtistSongs = lazy(() => ac().then((m) => ({ default: m.ArtistSongs })));
const ArtistVideos = lazy(() => ac().then((m) => ({ default: m.ArtistVideos })));
const ArtistEvents = lazy(() => ac().then((m) => ({ default: m.ArtistEvents })));
const ArtistAnalytics = lazy(() => ac().then((m) => ({ default: m.ArtistAnalytics })));
const CreatorDashboard = lazy(() => ac().then((m) => ({ default: m.CreatorDashboard })));
const CreatorContent = lazy(() => ac().then((m) => ({ default: m.CreatorContent })));
const CreatorPosts = lazy(() => ac().then((m) => ({ default: m.CreatorPosts })));
const CreatorVideos = lazy(() => ac().then((m) => ({ default: m.CreatorVideos })));
const CreatorCourses = lazy(() => ac().then((m) => ({ default: m.CreatorCourses })));
const CreatorAnalytics = lazy(() => ac().then((m) => ({ default: m.CreatorAnalytics })));

const ga = () => import("@/pages/admin/GlobalAdmin");
const AdminDashboard = lazy(() => ga().then((m) => ({ default: m.AdminDashboard })));
const AdminUsers = lazy(() => ga().then((m) => ({ default: m.AdminUsers })));
const AdminChurches = lazy(() => ga().then((m) => ({ default: m.AdminChurches })));
const AdminContent = lazy(() => ga().then((m) => ({ default: m.AdminContent })));
const AdminMedia = lazy(() => ga().then((m) => ({ default: m.AdminMedia })));
const AdminCourses = lazy(() => ga().then((m) => ({ default: m.AdminCourses })));
const AdminEvents = lazy(() => ga().then((m) => ({ default: m.AdminEvents })));
const AdminReports = lazy(() => ga().then((m) => ({ default: m.AdminReports })));
const AdminModeration = lazy(() => ga().then((m) => ({ default: m.AdminModeration })));
const AdminFoundation = lazy(() => ga().then((m) => ({ default: m.AdminFoundation })));
const AdminSettings = lazy(() => ga().then((m) => ({ default: m.AdminSettings })));
const AdminFeedback = lazy(() => ga().then((m) => ({ default: m.AdminFeedback })));

const eng = () => import("@/pages/admin/Engagement");
const AdminNotifications = lazy(() => eng().then((m) => ({ default: m.AdminNotifications })));
const AdminAudience = lazy(() => eng().then((m) => ({ default: m.AdminAudience })));

const ContentDetail = lazy(() => import("@/pages/content/ContentDetail"));

export function App() {
  return (
    <BrowserRouter>
      <BootGate>
        <Suspense fallback={<LoadingState />}>
        <Routes>
          {/* Públicas */}
          <Route path="/" element={<RootRoute landing={<Landing />} />} />
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/feedback" element={<Feedback />} />
          </Route>
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />

          {/* La aplicación: requiere sesión */}
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/home" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/search" element={<SearchPage />} />

            <Route path="/bible" element={<BibleIndex />} />
            <Route path="/bible/:book/:chapter" element={<BibleChapter />} />
            <Route path="/devotionals" element={<DevotionalsList />} />
            <Route path="/devotionals/:id" element={<DevotionalDetail />} />
            <Route path="/plans" element={<PlansList />} />
            <Route path="/plans/:id" element={<PlanDetail />} />
            <Route path="/prayer" element={<PrayerList />} />
            <Route path="/prayer/new" element={<PrayerNew />} />

            <Route path="/music" element={<MusicIndex />} />
            <Route path="/music/artists" element={<ArtistsList />} />
            <Route path="/music/artists/:id" element={<ArtistDetail />} />
            <Route path="/music/albums/:id" element={<AlbumDetail />} />
            <Route path="/music/playlists" element={<PlaylistsList />} />
            <Route path="/music/playlists/:id" element={<PlaylistDetail />} />

            <Route path="/podcasts" element={<PodcastsList />} />
            <Route path="/podcasts/suscritos" element={<PodcastFeedsList />} />
            <Route path="/podcasts/feed/:id" element={<PodcastFeedDetail />} />
            <Route path="/podcasts/:id" element={<PodcastDetail />} />
            <Route path="/sermons" element={<SermonsList />} />
            <Route path="/sermons/:id" element={<SermonDetail />} />
            <Route path="/videos" element={<VideosList />} />
            <Route path="/videos/:id" element={<VideoDetail />} />

            <Route path="/academy" element={<AcademyIndex />} />
            <Route path="/courses" element={<CoursesList />} />
            <Route path="/courses/:id" element={<CourseDetail />} />
            <Route path="/courses/:id/learn" element={<CourseLearn />} />

            <Route path="/churches" element={<ChurchesList />} />
            <Route path="/churches/:id" element={<ChurchDetail />} />
            <Route path="/my-church" element={<MyChurch />} />

            <Route path="/community" element={<Community />} />
            <Route path="/groups" element={<GroupsList />} />
            <Route path="/groups/:id" element={<GroupDetail />} />
            <Route path="/messages" element={<Messages />} />

            <Route path="/events" element={<EventsList />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/ministries" element={<MinistriesList />} />
            <Route path="/ministries/:id" element={<MinistryDetail />} />

            <Route path="/library" element={<Library />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:id" element={<Profile />} />
            <Route path="/settings" element={<SettingsPage />} />

            <Route path="/foundation" element={<FoundationIndex />} />
            <Route path="/foundation/cases" element={<FoundationCases />} />
            <Route path="/foundation/cases/:id" element={<FoundationCaseDetail />} />
            <Route path="/foundation/volunteer" element={<FoundationVolunteer />} />
            <Route path="/foundation/donate" element={<FoundationDonate />} />

            {/* Church admin */}
            <Route
              element={
                <RequirePermission permission="canManageChurch">
                  <Outlet />
                </RequirePermission>
              }
            >
              <Route path="/church-admin" element={<ChurchAdminDashboard />} />
              <Route path="/church-admin/members" element={<ChurchAdminMembers />} />
              <Route path="/church-admin/members/:id" element={<ChurchAdminMemberDetail />} />
              <Route path="/church-admin/groups" element={<ChurchAdminGroups />} />
              <Route path="/church-admin/ministries" element={<ChurchAdminMinistries />} />
              <Route path="/church-admin/events" element={<ChurchAdminEvents />} />
              <Route path="/church-admin/content" element={<ChurchAdminContent />} />
              <Route path="/church-admin/sermons" element={<ChurchAdminSermons />} />
              <Route path="/church-admin/courses" element={<ChurchAdminCourses />} />
              <Route path="/church-admin/messages" element={<ChurchAdminMessages />} />
              <Route path="/church-admin/prayer" element={<ChurchAdminPrayer />} />
              <Route path="/church-admin/settings" element={<ChurchAdminSettings />} />
            </Route>

            {/* Teacher */}
            <Route
              element={
                <RequirePermission permission="canManageCourses">
                  <Outlet />
                </RequirePermission>
              }
            >
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/teacher/courses" element={<TeacherCourses />} />
              <Route path="/teacher/courses/new" element={<TeacherCourseNew />} />
              <Route path="/teacher/courses/:id" element={<TeacherCourseDetail />} />
              <Route path="/teacher/courses/:id/edit" element={<TeacherCourseEdit />} />
              <Route path="/teacher/students" element={<TeacherStudents />} />
              <Route path="/teacher/assignments" element={<TeacherAssignments />} />
              <Route path="/teacher/evaluations" element={<TeacherEvaluations />} />
              <Route path="/teacher/certificates" element={<TeacherCertificates />} />
              <Route path="/teacher/analytics" element={<TeacherAnalytics />} />
            </Route>

            {/* Artist */}
            <Route
              element={
                <RequirePermission permission="canPublish">
                  <Outlet />
                </RequirePermission>
              }
            >
              <Route path="/artist" element={<ArtistDashboard />} />
              <Route path="/artist/music" element={<ArtistMusic />} />
              <Route path="/artist/albums" element={<ArtistAlbums />} />
              <Route path="/artist/songs" element={<ArtistSongs />} />
              <Route path="/artist/videos" element={<ArtistVideos />} />
              <Route path="/artist/events" element={<ArtistEvents />} />
              <Route path="/artist/analytics" element={<ArtistAnalytics />} />
            </Route>

            {/* Creator */}
            <Route
              element={
                <RequirePermission permission="canPublish">
                  <Outlet />
                </RequirePermission>
              }
            >
              <Route path="/creator" element={<CreatorDashboard />} />
              <Route path="/creator/content" element={<CreatorContent />} />
              <Route path="/creator/posts" element={<CreatorPosts />} />
              <Route path="/creator/videos" element={<CreatorVideos />} />
              <Route path="/creator/courses" element={<CreatorCourses />} />
              <Route path="/creator/analytics" element={<CreatorAnalytics />} />
            </Route>

            {/* Global admin */}
            <Route
              element={
                <RequirePermission permission="canManage">
                  <Outlet />
                </RequirePermission>
              }
            >
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/churches" element={<AdminChurches />} />
              <Route path="/admin/content" element={<AdminContent />} />
              <Route path="/admin/media" element={<AdminMedia />} />
              <Route path="/admin/courses" element={<AdminCourses />} />
              <Route path="/admin/events" element={<AdminEvents />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/moderation" element={<AdminModeration />} />
              <Route path="/admin/foundation" element={<AdminFoundation />} />
              <Route path="/admin/notifications" element={<AdminNotifications />} />
              <Route path="/admin/audience" element={<AdminAudience />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/feedback" element={<AdminFeedback />} />
            </Route>

            {/* Contenido añadido desde la app */}
            <Route path="/content/:id" element={<ContentDetail />} />

            {/* Conexión con el servidor */}
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BootGate>

      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ className: "font-sans" }}
      />
    </BrowserRouter>
  );
}
