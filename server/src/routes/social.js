/**
 * HESERIA — Comunidad, grupos, mensajes, oración y personas.
 *
 * Aquí todo es escritura real: un «me gusta» inserta una fila, un comentario
 * queda guardado y un mensaje enviado lo ven los dos lados de la conversación.
 */
import { Router } from "express";
import { optionalAuth, publicUser, requireAuth, requirePermission } from "../auth.js";
import { catalog, db, newId } from "../db.js";
import { badRequest, fold, forbidden, notFound, oneOf, str, wrap } from "../http.js";
import { fireAuto } from "./broadcast.js";
import { broadcastMessage, iceServers, isOnline } from "../realtime.js";
import { notify } from "../notify.js";

export const socialRouter = Router();

/* ------------------------------------------------------ serialización */

const POST_TYPES = ["testimonio", "reflexion", "peticion", "anuncio", "pregunta"];

const likeCount = db.prepare("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?");
const commentsFor = db.prepare(
  "SELECT id, author_id, body, created_at FROM comments WHERE post_id = ? ORDER BY created_at",
);
const likedBy = db.prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?");

function serializePost(row, viewerId) {
  return {
    id: row.id,
    authorId: row.author_id,
    groupId: row.group_id ?? undefined,
    type: row.type,
    body: row.body,
    createdAt: row.created_at,
    likes: likeCount.get(row.id).n,
    shares: 0,
    hashtags: JSON.parse(row.reference || "[]"),
    color: row.color,
    liked: viewerId ? Boolean(likedBy.get(row.id, viewerId)) : false,
    comments: commentsFor.all(row.id).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      body: c.body,
      createdAt: c.created_at,
      likes: 0,
    })),
  };
}

/* ------------------------------------------------------------ comunidad */

socialRouter.get(
  "/community/feed",
  optionalAuth,
  wrap((req, res) => {
    const filter = req.query.filter;
    const rows =
      filter && filter !== "todo"
        ? db.prepare(
            "SELECT * FROM posts WHERE type = ? AND status = 'visible' ORDER BY created_at DESC LIMIT 100",
          ).all(filter)
        : db.prepare(
            "SELECT * FROM posts WHERE status = 'visible' ORDER BY created_at DESC LIMIT 100",
          ).all();
    res.json(rows.map((r) => serializePost(r, req.user?.id)));
  }),
);

socialRouter.get(
  "/community/posts/:id",
  optionalAuth,
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Esa publicación ya no está disponible.");
    res.json(serializePost(row, req.user?.id));
  }),
);

socialRouter.get(
  "/community/authors/:id/posts",
  optionalAuth,
  wrap((req, res) => {
    const rows = db.prepare(
      "SELECT * FROM posts WHERE author_id = ? AND status = 'visible' ORDER BY created_at DESC",
    ).all(req.params.id);
    res.json(rows.map((r) => serializePost(r, req.user?.id)));
  }),
);

socialRouter.post(
  "/community/posts",
  requireAuth,
  requirePermission("canCreate"),
  wrap((req, res) => {
    const body = str(req.body?.body, "mensaje", { min: 2, max: 4000 });
    const type = oneOf(req.body?.type ?? "reflexion", POST_TYPES, "tipo");
    const hashtags = Array.isArray(req.body?.hashtags) ? req.body.hashtags.slice(0, 10) : [];
    const groupId = req.body?.groupId || null;

    if (groupId) {
      const member = db.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?")
        .get(groupId, req.user.id);
      if (!member) throw forbidden("Únete al grupo antes de publicar en él.");
    }

    const id = newId("po");
    db.prepare(`
      INSERT INTO posts (id, author_id, group_id, type, body, reference, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, groupId, type, body, JSON.stringify(hashtags), req.user.color);

    res.status(201).json(serializePost(db.prepare("SELECT * FROM posts WHERE id = ?").get(id), req.user.id));
  }),
);

/** Alterna el «me gusta»: la segunda pulsación lo retira. */
socialRouter.post(
  "/community/posts/:id/like",
  requireAuth,
  wrap((req, res) => {
    const id = req.params.id;
    if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(id)) throw notFound();
    const existing = likedBy.get(id, req.user.id);
    if (existing) db.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").run(id, req.user.id);
    else db.prepare("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)").run(id, req.user.id);
    res.json({ likes: likeCount.get(id).n, liked: !existing });
  }),
);

socialRouter.post(
  "/community/posts/:id/comments",
  requireAuth,
  wrap((req, res) => {
    const id = req.params.id;
    if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(id)) throw notFound();
    const body = str(req.body?.body, "comentario", { min: 1, max: 1000 });
    const commentId = newId("cm");
    db.prepare("INSERT INTO comments (id, post_id, author_id, body) VALUES (?, ?, ?, ?)")
      .run(commentId, id, req.user.id, body);

    // Aviso al autor, salvo que se comente a sí mismo.
    const post = db.prepare("SELECT author_id FROM posts WHERE id = ?").get(id);
    if (post.author_id !== req.user.id) {
      notify(post.author_id, {
        type: "comunidad",
        title: `${req.user.name} comentó tu publicación`,
        body: body ? body.slice(0, 120) : "Te envió un archivo",
        href: "/community",
      });
    }
    res.status(201).json({ ok: true, id: commentId });
  }),
);

socialRouter.delete(
  "/community/posts/:id",
  requireAuth,
  wrap((req, res) => {
    const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
    if (!post) throw notFound();
    const isOwner = post.author_id === req.user.id;
    const isModerator = ["admin", "moderator"].includes(req.user.role);
    if (!isOwner && !isModerator) throw forbidden("Solo puedes borrar tus publicaciones.");
    db.prepare("DELETE FROM posts WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  }),
);

socialRouter.post(
  "/community/posts/:id/report",
  requireAuth,
  wrap((req, res) => {
    const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
    if (!post) throw notFound();
    const reason = str(req.body?.reason, "motivo", { min: 3, max: 300 });
    db.prepare(`
      INSERT INTO moderation (id, target_kind, target_id, excerpt, reason, severity, reporter_id)
      VALUES (?, 'contenido', ?, ?, ?, 'media', ?)
    `).run(newId("mo"), post.id, post.body.slice(0, 160), reason, req.user.id);
    res.status(201).json({ ok: true });
  }),
);

/* --------------------------------------------------------------- grupos */

socialRouter.get(
  "/groups/:id/posts",
  optionalAuth,
  wrap((req, res) => {
    const rows = db.prepare(
      "SELECT * FROM posts WHERE group_id = ? AND status = 'visible' ORDER BY created_at DESC",
    ).all(req.params.id);
    res.json(rows.map((r) => serializePost(r, req.user?.id)));
  }),
);

socialRouter.get(
  "/groups/:id/members",
  wrap((req, res) => {
    const rows = db.prepare(`
      SELECT u.* FROM group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? AND u.status = 'active' ORDER BY u.name
    `).all(req.params.id);
    res.json(rows.map(publicUser));
  }),
);

socialRouter.post(
  "/groups/:id/join",
  requireAuth,
  wrap((req, res) => {
    const group = catalog.get("group", req.params.id);
    if (!group) throw notFound("Ese grupo no existe.");
    const key = { group_id: req.params.id, user_id: req.user.id };
    const existing = db.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?")
      .get(key.group_id, key.user_id);
    if (existing) {
      db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(key.group_id, key.user_id);
      return res.json({ joined: false });
    }
    db.prepare("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)").run(key.group_id, key.user_id);
    res.json({ joined: true });
  }),
);

/* -------------------------------------------------------------- oración */

const prayCount = db.prepare("SELECT COUNT(*) AS n FROM prayer_prays WHERE prayer_id = ?");
const prayedBy = db.prepare("SELECT 1 FROM prayer_prays WHERE prayer_id = ? AND user_id = ?");

function serializePrayer(row, viewerId) {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    body: row.body,
    category: row.category,
    visibility: row.scope === "church" ? "private" : "public",
    prayingCount: prayCount.get(row.id).n,
    answered: Boolean(row.answered),
    createdAt: row.created_at,
    testimony: row.testimony ?? undefined,
    praying: viewerId ? Boolean(prayedBy.get(row.id, viewerId)) : false,
    mine: viewerId === row.author_id,
  };
}

socialRouter.get(
  "/prayers",
  optionalAuth,
  wrap((req, res) => {
    const scope = req.query.scope ?? "all";
    let rows;
    if (scope === "mine") {
      if (!req.user) return res.json([]);
      rows = db.prepare("SELECT * FROM prayers WHERE author_id = ? ORDER BY created_at DESC").all(req.user.id);
    } else if (scope === "answered") {
      rows = db.prepare("SELECT * FROM prayers WHERE answered = 1 ORDER BY created_at DESC").all();
    } else if (scope === "church") {
      const churchId = req.user?.church_id;
      rows = churchId
        ? db.prepare("SELECT * FROM prayers WHERE church_id = ? ORDER BY created_at DESC").all(churchId)
        : [];
    } else {
      rows = db.prepare("SELECT * FROM prayers ORDER BY created_at DESC LIMIT 100").all();
    }
    res.json(rows.map((r) => serializePrayer(r, req.user?.id)));
  }),
);

socialRouter.get(
  "/prayers/:id",
  optionalAuth,
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM prayers WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Esa petición ya no está disponible.");
    res.json(serializePrayer(row, req.user?.id));
  }),
);

socialRouter.post(
  "/prayers",
  requireAuth,
  wrap((req, res) => {
    const title = str(req.body?.title, "título", { min: 3, max: 140 });
    const body = str(req.body?.body, "petición", { min: 5, max: 2000 });
    const category = str(req.body?.category, "categoría", { required: false, max: 60 }) || "General";
    const scope = oneOf(req.body?.scope ?? "all", ["all", "church"], "alcance");
    const anonymous = req.body?.anonymous === true;

    const id = newId("pr");
    db.prepare(`
      INSERT INTO prayers (id, author_id, title, body, category, scope, church_id, anonymous)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, title, body, category, scope, req.user.church_id ?? null, anonymous ? 1 : 0);

    res.status(201).json(serializePrayer(db.prepare("SELECT * FROM prayers WHERE id = ?").get(id), req.user.id));
  }),
);

socialRouter.post(
  "/prayers/:id/pray",
  requireAuth,
  wrap((req, res) => {
    const id = req.params.id;
    if (!db.prepare("SELECT 1 FROM prayers WHERE id = ?").get(id)) throw notFound();
    const existing = prayedBy.get(id, req.user.id);
    if (existing) db.prepare("DELETE FROM prayer_prays WHERE prayer_id = ? AND user_id = ?").run(id, req.user.id);
    else db.prepare("INSERT INTO prayer_prays (prayer_id, user_id) VALUES (?, ?)").run(id, req.user.id);
    res.json({ praying: !existing, prayingCount: prayCount.get(id).n });
  }),
);

/** Marcar respondida avisa a quienes oraron por ella. */
socialRouter.post(
  "/prayers/:id/answered",
  requireAuth,
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM prayers WHERE id = ?").get(req.params.id);
    if (!row) throw notFound();
    if (row.author_id !== req.user.id && req.user.role !== "admin") {
      throw forbidden("Solo quien la publicó puede marcarla como respondida.");
    }
    db.prepare("UPDATE prayers SET answered = 1 WHERE id = ?").run(row.id);

    const supporters = db.prepare("SELECT user_id FROM prayer_prays WHERE prayer_id = ?").all(row.id);
    fireAuto("prayer.answered", {
      titulo: row.title,
      href: `/prayer`,
      recipients: supporters.map((s) => s.user_id).filter((id) => id !== req.user.id),
    });
    res.json({ ok: true, answered: true });
  }),
);

/* ------------------------------------------------------------- mensajes */

socialRouter.get(
  "/conversations",
  requireAuth,
  wrap((req, res) => {
    const rows = db.prepare(`
      SELECT c.*,
             (SELECT COUNT(*) FROM messages m
               WHERE m.conversation_id = c.id AND m.read = 0 AND m.sender_id <> ?) AS unread,
             (SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_at
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = ?
      ORDER BY last_at DESC
    `).all(req.user.id, req.user.id);

    const members = db.prepare("SELECT user_id FROM conversation_members WHERE conversation_id = ?");
    res.json(
      rows.map((c) => ({
        id: c.id,
        kind: c.kind,
        title: c.title,
        participantIds: members.all(c.id).map((m) => m.user_id),
        lastMessageAt: c.last_at ?? c.created_at,
        unread: c.unread,
        color: c.color,
      })),
    );
  }),
);

function assertMember(conversationId, userId) {
  const member = db.prepare(
    "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
  ).get(conversationId, userId);
  if (!member) throw forbidden("No participas en esta conversación.");
}

/**
 * El archivo adjunto de un mensaje, listo para pintar. Va dentro del propio
 * mensaje para que el chat no tenga que pedir una ficha por cada adjunto.
 */
function attachmentOf(fileId) {
  if (!fileId) return null;
  const f = db.prepare("SELECT * FROM uploads WHERE id = ?").get(fileId);
  if (!f) return null;
  return {
    id: f.id,
    title: f.title || f.original_name,
    name: f.original_name,
    mime: f.mime,
    size: f.size,
    viewUrl: `/api/files/${f.id}/view`,
    downloadUrl: `/api/files/${f.id}/download`,
  };
}

socialRouter.get(
  "/conversations/:id/messages",
  requireAuth,
  wrap((req, res) => {
    assertMember(req.params.id, req.user.id);
    // Abrirla marca como leídos los mensajes ajenos.
    db.prepare("UPDATE messages SET read = 1 WHERE conversation_id = ? AND sender_id <> ?")
      .run(req.params.id, req.user.id);
    const rows = db.prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
    ).all(req.params.id);
    res.json(
      rows.map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        authorId: m.sender_id,
        body: m.body,
        createdAt: m.created_at,
        kind: m.kind,
        attachment: attachmentOf(m.attachment_id),
        reactions: m.reaction ? [m.reaction] : [],
        pinned: false,
      })),
    );
  }),
);

socialRouter.post(
  "/conversations/:id/messages",
  requireAuth,
  wrap((req, res) => {
    assertMember(req.params.id, req.user.id);

    const attachmentId = str(req.body?.attachmentId, "attachmentId", { required: false, max: 80 });
    // Con un archivo adjunto el texto es opcional: una foto ya dice algo.
    const body = str(req.body?.body, "mensaje", {
      min: attachmentId ? 0 : 1,
      max: 4000,
      required: !attachmentId,
    });

    let kind = "text";
    if (attachmentId) {
      const file = db.prepare("SELECT * FROM uploads WHERE id = ?").get(attachmentId);
      if (!file) throw badRequest("Ese archivo ya no está.", "no_file");
      if (file.owner_id !== req.user.id) throw forbidden("Ese archivo no es tuyo.");
      // El archivo se sube antes que el mensaje, así que ahora se ata a él y
      // se cierra a los miembros de la conversación.
      db.prepare(
        "UPDATE uploads SET scope = 'message', scope_id = ?, visibility = 'members' WHERE id = ?",
      ).run(req.params.id, attachmentId);
      kind = file.mime.startsWith("image/")
        ? "image"
        : file.mime.startsWith("audio/")
          ? "audio"
          : file.mime.startsWith("video/")
            ? "video"
            : "file";
    }

    const id = newId("m");
    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_id, body, kind, attachment_id) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, req.params.id, req.user.id, body, kind, attachmentId || null);

    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
    const message = {
      id: row.id,
      conversationId: row.conversation_id,
      authorId: row.sender_id,
      body: row.body,
      createdAt: row.created_at,
      kind: row.kind,
      attachment: attachmentOf(row.attachment_id),
      reactions: [],
    };

    // A quien tenga la conversación abierta le llega el mensaje al instante.
    broadcastMessage(req.params.id, message, req.user.id);

    // A quien no, le queda el aviso en el buzón y, si se puede, en el sistema.
    const others = db.prepare(
      "SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?",
    ).all(req.params.id, req.user.id);
    for (const o of others) {
      if (isOnline(o.user_id)) continue;
      notify(o.user_id, {
        type: "mensajes",
        title: `Nuevo mensaje de ${req.user.name}`,
        body: body.slice(0, 120),
        href: "/messages",
      });
    }

    res.status(201).json(message);
  }),
);

socialRouter.post(
  "/messages/:id/react",
  requireAuth,
  wrap((req, res) => {
    const emoji = str(req.body?.emoji, "reacción", { max: 8 });
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(req.params.id);
    if (!row) throw notFound();
    assertMember(row.conversation_id, req.user.id);
    db.prepare("UPDATE messages SET reaction = ? WHERE id = ?").run(emoji, row.id);
    res.json({ ok: true });
  }),
);

/** Abre (o reutiliza) una conversación directa con otra persona. */
socialRouter.post(
  "/conversations",
  requireAuth,
  wrap((req, res) => {
    const otherId = str(req.body?.userId, "usuario");
    if (otherId === req.user.id) throw badRequest("No puedes escribirte a ti.");
    const other = db.prepare("SELECT * FROM users WHERE id = ?").get(otherId);
    if (!other) throw notFound("Esa persona no existe.");

    const existing = db.prepare(`
      SELECT c.id FROM conversations c
      JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
      JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
      WHERE c.kind = 'direct' LIMIT 1
    `).get(req.user.id, otherId);
    if (existing) return res.json({ id: existing.id, created: false });

    const id = newId("cv");
    db.prepare("INSERT INTO conversations (id, kind, title, color) VALUES (?, 'direct', ?, ?)")
      .run(id, other.name, other.color);
    const addMember = db.prepare("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)");
    addMember.run(id, req.user.id);
    addMember.run(id, otherId);
    res.status(201).json({ id, created: true });
  }),
);

/**
 * Prepara una llamada.
 *
 * La negociación va por WebSocket y el audio y el video viajan directos entre
 * los dos dispositivos (WebRTC). Aquí solo se comprueba que la persona esté
 * disponible y se entregan los servidores ICE.
 */
socialRouter.post(
  "/conversations/:id/call",
  requireAuth,
  wrap((req, res) => {
    assertMember(req.params.id, req.user.id);
    const kind = oneOf(req.body?.kind ?? "audio", ["audio", "video"], "tipo");

    const others = db.prepare(
      "SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?",
    ).all(req.params.id, req.user.id).map((r) => r.user_id);

    if (others.length !== 1) {
      throw badRequest("Las llamadas de grupo todavía no están disponibles.", "group_call");
    }

    const peerId = others[0];
    const peer = db.prepare("SELECT id, name, color FROM users WHERE id = ?").get(peerId);
    const online = isOnline(peerId);

    // Si no tiene la app abierta, se le avisa para que la abra.
    if (!online) {
      notify(peerId, {
        type: "mensajes",
        title: `Llamada perdida de ${req.user.name}`,
        body: kind === "video" ? "Te llamó por video." : "Te llamó.",
        href: "/messages",
      });
    }

    res.json({ peer, kind, online, iceServers: iceServers() });
  }),
);

/* -------------------------------------------------------------- personas */

socialRouter.get(
  "/users",
  wrap((req, res) => {
    let sql = "SELECT * FROM users WHERE status = 'active'";
    const params = [];
    if (req.query.role) {
      sql += " AND role = ?";
      params.push(req.query.role);
    }
    if (req.query.churchId) {
      sql += " AND church_id = ?";
      params.push(req.query.churchId);
    }
    if (req.query.q) {
      sql += " AND (lower(name) LIKE ? OR lower(handle) LIKE ?)";
      const term = `%${String(req.query.q).toLowerCase()}%`;
      params.push(term, term);
    }
    sql += " ORDER BY name LIMIT 200";
    res.json(db.prepare(sql).all(...params).map(publicUser));
  }),
);

socialRouter.get(
  "/users/suggested",
  optionalAuth,
  wrap((req, res) => {
    const rows = db.prepare(`
      SELECT * FROM users WHERE status = 'active' AND id <> ?
      AND id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
      ORDER BY followers DESC LIMIT 8
    `).all(req.user?.id ?? "", req.user?.id ?? "");
    res.json(rows.map(publicUser));
  }),
);

socialRouter.get(
  "/users/:id",
  optionalAuth,
  wrap((req, res) => {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!row) throw notFound("Esa persona no existe.");
    const user = publicUser(row);
    user.followers = db.prepare("SELECT COUNT(*) AS n FROM follows WHERE following_id = ?").get(row.id).n;
    user.following = db.prepare("SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?").get(row.id).n;
    if (req.user) {
      user.isFollowing = Boolean(
        db.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?")
          .get(req.user.id, row.id),
      );
    }
    res.json(user);
  }),
);

socialRouter.post(
  "/users/:id/follow",
  requireAuth,
  wrap((req, res) => {
    if (req.params.id === req.user.id) throw badRequest("No puedes seguirte a ti.");
    if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(req.params.id)) throw notFound();
    const existing = db.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?")
      .get(req.user.id, req.params.id);
    if (existing) {
      db.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?")
        .run(req.user.id, req.params.id);
    } else {
      db.prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)")
        .run(req.user.id, req.params.id);
      notify(req.params.id, {
        type: "comunidad",
        title: `${req.user.name} te sigue`,
        body: "",
        href: `/profile/${req.user.id}`,
      });
    }
    res.json({ following: !existing });
  }),
);

/* ---------------------------------------------------- eventos e iglesia */

socialRouter.post(
  "/events/:id/rsvp",
  requireAuth,
  wrap((req, res) => {
    if (!catalog.get("event", req.params.id)) throw notFound("Ese evento no existe.");
    const existing = db.prepare("SELECT 1 FROM event_rsvps WHERE event_id = ? AND user_id = ?")
      .get(req.params.id, req.user.id);
    if (existing) {
      db.prepare("DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?").run(req.params.id, req.user.id);
    } else {
      db.prepare("INSERT INTO event_rsvps (event_id, user_id) VALUES (?, ?)").run(req.params.id, req.user.id);
    }
    const going = db.prepare("SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id = ?").get(req.params.id).n;
    res.json({ going: !existing, attendees: going });
  }),
);

socialRouter.post(
  "/churches/:id/join",
  requireAuth,
  wrap((req, res) => {
    if (!catalog.get("church", req.params.id)) throw notFound("Esa iglesia no existe.");
    db.prepare("INSERT OR IGNORE INTO church_members (church_id, user_id) VALUES (?, ?)")
      .run(req.params.id, req.user.id);
    db.prepare("UPDATE users SET church_id = ? WHERE id = ?").run(req.params.id, req.user.id);
    res.json({ joined: true, churchId: req.params.id });
  }),
);

socialRouter.get(
  "/my-church",
  requireAuth,
  wrap((req, res) => {
    if (!req.user.church_id) return res.json(null);
    res.json(catalog.get("church", req.user.church_id) ?? null);
  }),
);

void fold;
