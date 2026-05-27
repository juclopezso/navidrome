const stylesheet = `

.react-jinke-music-player-main {
    --bg: #313544;
    --sidebar: #252833;
    --surface: #3A3F52;
    --surface-hover: #454B63;

    --primary: #C84DFF;
    --secondary: #22D3EE;
    --accent: #FF4FD8;
    --highlight: #FFE45E;

    --text: #FFFFFF;
    --text-muted: #D5D9E6;

    --border: rgba(255,255,255,0.06);
}

/* =========================
   ICONS
========================= */

.react-jinke-music-player-main .music-player-panel svg {
    color: var(--text);

    transition:
        color .2s ease,
        transform .2s ease;
}

.react-jinke-music-player-main .music-player-panel button:disabled svg {
    opacity: 0.3;
}

.react-jinke-music-player-main svg:active,
.react-jinke-music-player-main svg:hover {
    color: var(--secondary);

    transform: scale(1.05);
}

/* =========================
   SLIDER
========================= */

.react-jinke-music-player-main .music-player-panel .panel-content .rc-slider-track,
.react-jinke-music-player-mobile-progress .rc-slider-track {
    background:
        linear-gradient(
            90deg,
            var(--primary) 0%,
            var(--secondary) 100%
        );
}

.react-jinke-music-player-main .music-player-panel .panel-content .rc-slider-handle,
.react-jinke-music-player-mobile-progress .rc-slider-handle {
    background-color: #FFFFFF;

    border: 3px solid var(--secondary);

    box-shadow:
        0 0 12px rgba(34,211,238,0.25),
        0 0 20px rgba(200,77,255,0.18);
}

.react-jinke-music-player-main .music-player-panel .panel-content .rc-slider-handle:active {
    box-shadow:
        0 0 18px rgba(34,211,238,0.4),
        0 0 30px rgba(200,77,255,0.3);
}

/* =========================
   SCROLLBAR
========================= */

.react-jinke-music-player-main ::-webkit-scrollbar {
    width: 8px;
}

.react-jinke-music-player-main ::-webkit-scrollbar-thumb {
    background:
        linear-gradient(
            180deg,
            var(--primary) 0%,
            var(--secondary) 100%
        );

    border-radius: 999px;
}

/* =========================
   PLAYING STATES
========================= */

.audio-lists-panel-content .audio-item.playing,
.react-jinke-music-player-main .audio-item.playing svg,
.react-jinke-music-player-main .group player-delete {
    color: var(--secondary);
}

.react-jinke-music-player-main .audio-item.playing .player-singer {
    color: var(--secondary) !important;
}

.react-jinke-music-player-main .loading svg {
    color: var(--primary) !important;
}

/* =========================
   AUDIO ITEMS
========================= */

.audio-lists-panel-content .audio-item {
    border-radius: 12px;

    transition:
        background-color .2s ease,
        transform .2s ease,
        color .2s ease;
}

.audio-lists-panel-content .audio-item:hover,
.audio-lists-panel-content .audio-item:active {
    background-color: var(--surface-hover);

    transform: translateX(2px);
}

.audio-lists-panel-content .audio-item:hover svg,
.audio-lists-panel-content .audio-item:active svg,
.audio-lists-panel-content .audio-item:active .group:not([class=".player-delete"]) svg,
.audio-lists-panel-content .audio-item:hover .group:not([class=".player-delete"]) svg {
    color: var(--accent);
}

/* =========================
   LYRICS
========================= */

.react-jinke-music-player-main .lyric-btn-active svg {
    color: var(--secondary) !important;
}

.react-jinke-music-player-main .lyric-btn-active {
    color: var(--accent) !important;
}

.react-jinke-music-player-main .music-player-lyric {
    color: var(--text) !important;

    text-shadow:
        0 0 10px rgba(200,77,255,0.25),
        0 0 18px rgba(34,211,238,0.18);

    font-weight: 700;

    -webkit-text-stroke: 0.35px rgba(0,0,0,0.25);
}

/* =========================
   PLAYER PANEL
========================= */

.react-jinke-music-player-main .music-player-panel,
.react-jinke-music-player-mobile,
.ril__outer {
    background:
        linear-gradient(
            135deg,
            rgba(58,63,82,0.98),
            rgba(37,40,51,0.98)
        );

    border: 1px solid rgba(255,255,255,0.05);

    backdrop-filter: blur(18px);

    box-shadow:
        0 10px 30px rgba(0,0,0,0.25),
        0 0 24px rgba(200,77,255,0.08);
}

/* =========================
   TOOLBAR
========================= */

.ril__toolbar {
    background: rgba(37,40,51,0.98);

    border: 1px solid rgba(255,255,255,0.05);

    border-radius: 10px 10px 0 0;
}

.ril__toolbarItem {
    font-size: 100%;

    color: var(--text);
}

/* =========================
   AUDIO LIST PANEL
========================= */

.audio-lists-panel {
    background:
        linear-gradient(
            135deg,
            rgba(58,63,82,0.98),
            rgba(37,40,51,0.98)
        );

    border: 1px solid rgba(255,255,255,0.05);

    border-radius: 16px 16px 0 0;

    backdrop-filter: blur(18px);

    box-shadow:
        0 16px 40px rgba(0,0,0,0.28),
        0 0 24px rgba(200,77,255,0.08);
}

/* =========================
   COVER / ALBUM
========================= */

.react-jinke-music-player-main .music-player-panel .panel-content .img-rotate,
.react-jinke-music-player-mobile .react-jinke-music-player-mobile-cover img.cover,
.react-jinke-music-player-mobile-cover {
    border-radius: 14px !important;

    animation-duration: 0s !important;
}

.react-jinke-music-player-main .music-player-panel .panel-content .img-content {
    width: 60px;
    height: 60px;

    border-radius: 14px;

    overflow: hidden;

    box-shadow:
        0 12px 28px rgba(0,0,0,0.25),
        0 0 20px rgba(200,77,255,0.15);
}

/* =========================
   TITLES / TEXT
========================= */

.react-jinke-music-player-main .songTitle {
    color: var(--text);
}

.react-jinke-music-player .music-player-controller {
    color: var(--secondary);

    background:
        linear-gradient(
            135deg,
            rgba(58,63,82,0.98),
            rgba(37,40,51,0.98)
        );

    border: none;

    box-shadow:
        0 10px 30px rgba(0,0,0,0.25),
        0 0 20px rgba(200,77,255,0.08);
}

.react-jinke-music-player .music-player-controller .music-player-controller-setting {
    background:
        linear-gradient(
            135deg,
            rgba(200,77,255,0.28),
            rgba(34,211,238,0.28)
        );
}

/* =========================
   MOBILE LIST
========================= */

.audio-lists-panel-mobile .audio-item:not(.audio-lists-panel-sortable-highlight-bg) {
    background: unset;
}

/* =========================
   LASTFM / MUSICBRAINZ
========================= */

.lastfm-icon,
.musicbrainz-icon {
    color: var(--text);
}

`

export default stylesheet