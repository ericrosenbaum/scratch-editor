import React, {useState, useMemo, useCallback, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
import ReactModal from 'react-modal';
import classNames from 'classnames';

import analyzeProject from '../../lib/structure-analysis/project-analyzer.js';
import computeLayout from '../../lib/structure-analysis/layout-engine.js';

import styles from './structure-view.css';

// ── Color palette ──────────────────────────────────────────
const COLORS = {
    greenFlag: '#4CAF50',
    broadcast: '#9C27B0',
    broadcastArrow: '#CE93D8',
    keyPress: '#2196F3',
    spriteClick: '#FF9800',
    backdrop: '#FF5722',
    loudness: '#795548',
    clone: '#009688',
    variable: '#FFC107',
    list: '#AB47BC',
    sensing: '#00BCD4',
    dimmed: 0.15,
    normal: 1.0,
    highlighted: 1.0
};

function getEventColor (type) {
    switch (type) {
    case 'event_whenflagclicked': return COLORS.greenFlag;
    case 'event_whenkeypressed': return COLORS.keyPress;
    case 'event_whenthisspriteclicked':
    case 'event_whenstageclicked': return COLORS.spriteClick;
    case 'event_whenbroadcastreceived': return COLORS.broadcast;
    case 'event_whenbackdropswitchesto': return COLORS.backdrop;
    case 'event_whengreaterthan': return COLORS.loudness;
    case 'control_start_as_clone': return COLORS.clone;
    default: return '#999';
    }
}

// ── SVG Curved Arrow ───────────────────────────────────────
const CurvedArrow = ({
    x1, y1, x2, y2, color, dashed, opacity, strokeWidth, arrowHead, curveOffset
}) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    // Perpendicular offset for curve
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = curveOffset || len * 0.15;
    const cx = midX + nx * offset;
    const cy = midY + ny * offset;

    const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;

    // Arrowhead
    let arrowD = '';
    if (arrowHead) {
        const t = 0.95;
        const ax = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
        const ay = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
        const adx = x2 - ax;
        const ady = y2 - ay;
        const aLen = Math.sqrt(adx * adx + ady * ady) || 1;
        const ux = adx / aLen;
        const uy = ady / aLen;
        const size = 6;
        const p1x = x2 - ux * size - uy * size * 0.4;
        const p1y = y2 - uy * size + ux * size * 0.4;
        const p2x = x2 - ux * size + uy * size * 0.4;
        const p2y = y2 - uy * size - ux * size * 0.4;
        arrowD = `M ${x2} ${y2} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`;
    }

    return (
        <g opacity={opacity}>
            <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth || 1.5}
                strokeDasharray={dashed ? '6 3' : undefined}
            />
            {/* Wider invisible hit area */}
            <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
            />
            {arrowHead && <path d={arrowD} fill={color} />}
        </g>
    );
};

CurvedArrow.propTypes = {
    x1: PropTypes.number.isRequired,
    y1: PropTypes.number.isRequired,
    x2: PropTypes.number.isRequired,
    y2: PropTypes.number.isRequired,
    color: PropTypes.string,
    dashed: PropTypes.bool,
    opacity: PropTypes.number,
    strokeWidth: PropTypes.number,
    arrowHead: PropTypes.bool,
    curveOffset: PropTypes.number
};

// eslint-disable-next-line require-jsdoc, func-style
const GREEN_FLAG_PATH = [
    'M.75,2A6.44,6.44,0,0,1,8.44,2h0a6.44,',
    '6.44,0,0,0,7.69,0V12.4a6.44,6.44,0,0,',
    '1-7.69,0h0a6.44,6.44,0,0,0-7.69,0'
].join('');

// ── Green Flag Icon (inline SVG path) ─────────────────────
const GreenFlagIcon = ({x, y, size}) => {
    const scale = size / 17.5;
    return (
        <g transform={`translate(${x}, ${y}) scale(${scale})`}>
            <path
                d={GREEN_FLAG_PATH}
                fill="#fff"
                stroke="rgba(255,255,255,0.6)"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <line
                x1="0.75"
                y1="16.75"
                x2="0.75"
                y2="0.75"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </g>
    );
};

GreenFlagIcon.propTypes = {
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    size: PropTypes.number.isRequired
};

// ── Event Bubble ───────────────────────────────────────────
const EventBubble = ({event, pos, opacity, onMouseEnter, onMouseLeave}) => {
    const color = getEventColor(event.type);
    const isGreenFlag = event.type === 'event_whenflagclicked';
    return (
        <g
            opacity={opacity}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{cursor: 'pointer'}}
        >
            <rect
                x={pos.x}
                y={pos.y}
                width={pos.width}
                height={pos.height}
                rx={pos.height / 2}
                fill={color}
                stroke={opacity >= 0.9 ? color : 'none'}
                strokeWidth={opacity >= 0.9 ? 1.5 : 0}
            />
            {isGreenFlag ? (
                <GreenFlagIcon
                    x={pos.centerX - 8}
                    y={pos.centerY - 8}
                    size={16}
                />
            ) : (
                <text
                    x={pos.centerX}
                    y={pos.centerY + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#fff"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="sans-serif"
                    pointerEvents="none"
                >
                    {event.shortLabel.length > 8 ? `${event.shortLabel.slice(0, 7)}…` : event.shortLabel}
                </text>
            )}
        </g>
    );
};

EventBubble.propTypes = {
    event: PropTypes.object.isRequired,
    pos: PropTypes.object.isRequired,
    opacity: PropTypes.number,
    onMouseEnter: PropTypes.func,
    onMouseLeave: PropTypes.func
};

// ── Sprite Node ────────────────────────────────────────────
const SpriteNode = ({sprite, pos, opacity, isSelected, onMouseEnter, onMouseLeave, onClick, thumbnailUrl, onDragStart, isDragging}) => {
    const borderColor = isSelected ? '#4C97FF' : '#ccc';
    const borderWidth = isSelected ? 2.5 : 1;
    const initial = sprite.name.charAt(0).toUpperCase();
    const bgColor = sprite.isStage ? '#F0E68C' : '#E3F2FD';
    const thumbWidth = 56;
    const thumbHeight = 42;
    const thumbX = pos.centerX - thumbWidth / 2;
    const thumbY = pos.y + 4;
    const clipId = `thumb-clip-${sprite.id}`;

    return (
        <g
            opacity={opacity}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
            onMouseDown={onDragStart}
            style={{cursor: isDragging ? 'grabbing' : 'grab'}}
        >
            <rect
                x={pos.x}
                y={pos.y}
                width={pos.width}
                height={pos.height}
                rx={sprite.isStage ? 4 : 10}
                fill={bgColor}
                stroke={borderColor}
                strokeWidth={borderWidth}
            />
            {/* Thumbnail or fallback initial */}
            <defs>
                <clipPath id={clipId}>
                    <rect
                        x={thumbX}
                        y={thumbY}
                        width={thumbWidth}
                        height={thumbHeight}
                        rx={6}
                    />
                </clipPath>
            </defs>
            {thumbnailUrl ? (
                <React.Fragment>
                    <rect
                        x={thumbX}
                        y={thumbY}
                        width={thumbWidth}
                        height={thumbHeight}
                        rx={6}
                        fill="#fff"
                    />
                    <image
                        href={thumbnailUrl}
                        x={thumbX}
                        y={thumbY}
                        width={thumbWidth}
                        height={thumbHeight}
                        preserveAspectRatio="xMidYMid meet"
                        clipPath={`url(#${clipId})`}
                    />
                </React.Fragment>
            ) : (
                <React.Fragment>
                    <circle
                        cx={pos.centerX}
                        cy={pos.y + 25}
                        r={18}
                        fill={sprite.isStage ? '#DAA520' : '#4C97FF'}
                        opacity={0.8}
                    />
                    <text
                        x={pos.centerX}
                        y={pos.y + 26}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#fff"
                        fontSize="16"
                        fontWeight="700"
                        fontFamily="sans-serif"
                        pointerEvents="none"
                    >
                        {initial}
                    </text>
                </React.Fragment>
            )}
            {/* Name */}
            <text
                x={pos.centerX}
                y={pos.y + 58}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#333"
                fontSize="10"
                fontWeight="600"
                fontFamily="sans-serif"
                pointerEvents="none"
            >
                {sprite.name.length > 10 ? `${sprite.name.slice(0, 9)}…` : sprite.name}
            </text>
            {/* Stats line */}
            <text
                x={pos.centerX}
                y={pos.y + 72}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#999"
                fontSize="8"
                fontFamily="monospace"
                pointerEvents="none"
            >
                {`${sprite.scriptCount}s ${sprite.blockCount}b ${sprite.costumeCount}c`}
            </text>
        </g>
    );
};

SpriteNode.propTypes = {
    sprite: PropTypes.object.isRequired,
    pos: PropTypes.object.isRequired,
    opacity: PropTypes.number,
    isSelected: PropTypes.bool,
    onMouseEnter: PropTypes.func,
    onMouseLeave: PropTypes.func,
    onClick: PropTypes.func,
    thumbnailUrl: PropTypes.string,
    onDragStart: PropTypes.func,
    isDragging: PropTypes.bool
};

// ── Global Bubble ──────────────────────────────────────────
const GlobalBubble = ({global, pos, opacity, onMouseEnter, onMouseLeave}) => {
    const color = global.type === 'list' ? COLORS.list : COLORS.variable;
    const icon = global.type === 'list' ? '☰' : '𝑥';
    return (
        <g
            opacity={opacity}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{cursor: 'pointer'}}
        >
            <rect
                x={pos.x}
                y={pos.y}
                width={pos.width}
                height={pos.height}
                rx={6}
                fill={color}
                opacity={0.85}
            />
            <text
                x={pos.centerX}
                y={pos.centerY + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={global.type === 'variable' ? '#333' : '#fff'}
                fontSize="10"
                fontWeight="600"
                fontFamily="sans-serif"
                pointerEvents="none"
            >
                {`${icon} ${global.name.length > 8 ? `${global.name.slice(0, 7)}…` : global.name}`}
            </text>
        </g>
    );
};

GlobalBubble.propTypes = {
    global: PropTypes.object.isRequired,
    pos: PropTypes.object.isRequired,
    opacity: PropTypes.number,
    onMouseEnter: PropTypes.func,
    onMouseLeave: PropTypes.func
};

// ── Detail Panel ───────────────────────────────────────────
const DetailPanel = ({hoverTarget, structure}) => {
    if (!hoverTarget) {
        return (
            <div className={styles.detailPanel}>
                <div className={styles.detailTitle}>Structure View</div>
                <div className={styles.detailSection}>
                    <div className={styles.detailItem}>
                        Hover over any element to see details. Click a sprite to pin selection.
                    </div>
                </div>
                <div className={styles.detailSection}>
                    <div className={styles.detailSectionHeader}>Legend</div>
                    <div className={styles.detailItem}>
                        <span className={classNames(styles.detailPill, styles.pillGreen)}>Event</span>
                        {' triggers sprites'}
                    </div>
                    <div className={styles.detailItem}>
                        <span className={classNames(styles.detailPill, styles.pillPurple)}>Broadcast</span>
                        {' messages between sprites'}
                    </div>
                    <div className={styles.detailItem}>
                        <span className={classNames(styles.detailPill, styles.pillAmber)}>Variable</span>
                        {' / '}
                        <span className={classNames(styles.detailPill, styles.pillPurple)}>List</span>
                        {' shared across sprites'}
                    </div>
                </div>
            </div>
        );
    }

    const {type, data} = hoverTarget;

    if (type === 'sprite') {
        const sprite = data;
        // Find related events, broadcasts, globals
        const relatedEvents = structure.events.filter(e => e.sprites.includes(sprite.name));
        const sentBroadcasts = structure.broadcasts.filter(
            b => b.senders.some(s => s.sprite === sprite.name)
        );
        const receivedBroadcasts = structure.broadcasts.filter(
            b => b.receivers.includes(sprite.name)
        );
        const readGlobals = structure.globals.filter(g => g.readers.includes(sprite.name));
        const writtenGlobals = structure.globals.filter(g => g.writers.includes(sprite.name));
        const clones = structure.cloneRelationships.filter(
            c => c.creator === sprite.name || c.target === sprite.name
        );

        return (
            <div className={styles.detailPanel}>
                <div className={styles.detailTitle}>
                    {sprite.isStage ? '🎭' : '🎨'} {sprite.name}
                </div>
                <div className={styles.detailSection}>
                    <div className={styles.detailItem}>
                        {sprite.scriptCount} scripts, {sprite.blockCount} blocks
                    </div>
                    <div className={styles.detailItem}>
                        {sprite.costumeCount} costumes, {sprite.soundCount} sounds
                    </div>
                </div>
                {relatedEvents.length > 0 && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionHeader}>Events</div>
                        {relatedEvents.map(e => (
                            <span
                                key={e.id}
                                className={styles.detailPill}
                                style={{background: getEventColor(e.type)}}
                            >
                                {e.shortLabel}
                            </span>
                        ))}
                    </div>
                )}
                {sentBroadcasts.length > 0 && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionHeader}>Sends</div>
                        {sentBroadcasts.map(b => (
                            <span
                                key={b.message}
                                className={classNames(styles.detailPill, styles.pillPurple)}
                            >
                                {b.message}
                            </span>
                        ))}
                    </div>
                )}
                {receivedBroadcasts.length > 0 && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionHeader}>Receives</div>
                        {receivedBroadcasts.map(b => (
                            <span
                                key={b.message}
                                className={classNames(styles.detailPill, styles.pillPurple)}
                            >
                                {b.message}
                            </span>
                        ))}
                    </div>
                )}
                {(readGlobals.length > 0 || writtenGlobals.length > 0) && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionHeader}>Variables</div>
                        {writtenGlobals.map(g => (
                            <div key={g.id} className={styles.detailItem}>
                                writes {g.type === 'list' ? '☰' : '𝑥'} {g.name}
                            </div>
                        ))}
                        {readGlobals.map(g => (
                            <div key={g.id} className={styles.detailItem}>
                                reads {g.type === 'list' ? '☰' : '𝑥'} {g.name}
                            </div>
                        ))}
                    </div>
                )}
                {clones.length > 0 && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionHeader}>Clones</div>
                        {clones.map((c, i) => (
                            <div key={i} className={styles.detailItem}>
                                {c.creator === sprite.name ? `creates clone of ${c.target}` :
                                    `cloned by ${c.creator}`}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (type === 'event') {
        const event = data;
        return (
            <div className={styles.detailPanel}>
                <div className={styles.detailTitle}>
                    <span
                        className={styles.detailPill}
                        style={{background: getEventColor(event.type)}}
                    >
                        {event.shortLabel}
                    </span>
                </div>
                <div className={styles.detailSection}>
                    <div className={styles.detailItem}>{event.label}</div>
                </div>
                <div className={styles.detailSection}>
                    <div className={styles.detailSectionHeader}>
                        {`Triggers ${event.sprites.length} sprite${event.sprites.length !== 1 ? 's' : ''}`}
                    </div>
                    {event.sprites.map(s => (
                        <div key={s} className={styles.detailItem}>{s}</div>
                    ))}
                </div>
            </div>
        );
    }

    if (type === 'global') {
        const g = data;
        return (
            <div className={styles.detailPanel}>
                <div className={styles.detailTitle}>
                    {g.type === 'list' ? '☰' : '𝑥'} {g.name}
                </div>
                <div className={styles.detailSection}>
                    <div className={styles.detailItem}>
                        {g.type === 'list' ? 'List' : 'Variable'} (for all sprites)
                    </div>
                </div>
                {g.writers.length > 0 && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionHeader}>Writers</div>
                        {g.writers.map(s => (
                            <div key={s} className={styles.detailItem}>{s}</div>
                        ))}
                    </div>
                )}
                {g.readers.length > 0 && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionHeader}>Readers</div>
                        {g.readers.map(s => (
                            <div key={s} className={styles.detailItem}>{s}</div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (type === 'broadcast') {
        const bc = data;
        return (
            <div className={styles.detailPanel}>
                <div className={styles.detailTitle}>
                    <span className={classNames(styles.detailPill, styles.pillPurple)}>
                        {bc.message}
                    </span>
                </div>
                <div className={styles.detailSection}>
                    <div className={styles.detailItem}>Broadcast message</div>
                </div>
                {bc.senders.length > 0 && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionHeader}>Senders</div>
                        {bc.senders.map((s, i) => (
                            <div key={i} className={styles.detailItem}>
                                {s.sprite}
                                {s.isAndWait ? ' (and wait)' : ''}
                                {s.scriptContext ? ` [${s.scriptContext}]` : ''}
                            </div>
                        ))}
                    </div>
                )}
                {bc.receivers.length > 0 && (
                    <div className={styles.detailSection}>
                        <div className={styles.detailSectionHeader}>Receivers</div>
                        {bc.receivers.map(s => (
                            <div key={s} className={styles.detailItem}>{s}</div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return <div className={styles.detailPanel} />;
};

DetailPanel.propTypes = {
    hoverTarget: PropTypes.object,
    structure: PropTypes.object.isRequired
};

// ── Main Structure View ────────────────────────────────────
const StructureView = ({isOpen, onClose, vm}) => {
    const [hoverTarget, setHoverTarget] = useState(null);
    const [selectedSprite, setSelectedSprite] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [positionOverrides, setPositionOverrides] = useState({});
    const [draggingSpriteId, setDraggingSpriteId] = useState(null);
    const dragRef = useRef(null);
    const svgRef = useRef(null);

    // Re-analyze when opened
    const structure = useMemo(() => {
        if (!isOpen || !vm) return null;
        const targets = vm.runtime ? vm.runtime.targets : [];
        return analyzeProject(targets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, vm]);

    const layout = useMemo(() => {
        if (!structure) return null;
        return computeLayout(structure);
    }, [structure]);

    // Extract thumbnail URLs from VM targets
    const thumbnails = useMemo(() => {
        if (!isOpen || !vm || !vm.runtime) return {};
        const result = {};
        for (const target of vm.runtime.targets) {
            const costumes = target.sprite ? target.sprite.costumes : target.costumes;
            if (costumes && costumes.length > 0) {
                const currentIndex = target.currentCostume || 0;
                const costume = costumes[currentIndex];
                if (costume && costume.asset) {
                    try {
                        result[target.id] = costume.asset.encodeDataURI();
                    } catch (e) {
                        // fallback — no thumbnail
                    }
                }
            }
        }
        return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, vm, structure]);

    // Clear selection when closing
    useEffect(() => {
        if (!isOpen) {
            setHoverTarget(null);
            setSelectedSprite(null);
            setZoom(1);
            setPositionOverrides({});
        }
    }, [isOpen]);

    // ── Highlight computation ──
    const highlighted = useMemo(() => {
        const result = {
            sprites: new Set(),
            events: new Set(),
            globals: new Set(),
            broadcasts: new Set()
        };

        const active = hoverTarget || (selectedSprite ? {type: 'sprite', data: selectedSprite} : null);
        if (!active || !structure) return null;

        if (active.type === 'sprite') {
            const name = active.data.name;
            result.sprites.add(name);

            // Connected events
            for (const e of structure.events) {
                if (e.sprites.includes(name)) {
                    result.events.add(e.id);
                }
            }

            // Connected broadcasts
            for (const bc of structure.broadcasts) {
                const isSender = bc.senders.some(s => s.sprite === name);
                const isReceiver = bc.receivers.includes(name);
                if (isSender || isReceiver) {
                    result.broadcasts.add(bc.message);
                    // Also highlight the other end
                    if (isSender) {
                        bc.receivers.forEach(r => result.sprites.add(r));
                    }
                    if (isReceiver) {
                        bc.senders.forEach(s => result.sprites.add(s.sprite));
                    }
                }
            }

            // Connected globals
            for (const g of structure.globals) {
                if (g.writers.includes(name) || g.readers.includes(name)) {
                    result.globals.add(g.id);
                    // Highlight other sprites connected via this global
                    [...g.writers, ...g.readers].forEach(s => result.sprites.add(s));
                }
            }

            // Connected clones
            for (const c of structure.cloneRelationships) {
                if (c.creator === name || c.target === name) {
                    result.sprites.add(c.creator);
                    result.sprites.add(c.target);
                }
            }
        } else if (active.type === 'event') {
            const event = active.data;
            result.events.add(event.id);
            event.sprites.forEach(s => result.sprites.add(s));
        } else if (active.type === 'global') {
            const g = active.data;
            result.globals.add(g.id);
            [...g.writers, ...g.readers].forEach(s => result.sprites.add(s));
        } else if (active.type === 'broadcast') {
            const bc = active.data;
            result.broadcasts.add(bc.message);
            bc.senders.forEach(s => result.sprites.add(s.sprite));
            bc.receivers.forEach(r => result.sprites.add(r));
        }

        return result;
    }, [hoverTarget, selectedSprite, structure]);

    const handleZoomIn = useCallback(() => {
        setZoom(z => Math.min(z * 1.25, 4));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoom(z => Math.max(z / 1.25, 0.25));
    }, []);

    const handleZoomReset = useCallback(() => {
        setZoom(1);
    }, []);

    // ── Drag helpers ──
    const screenToSVG = useCallback((clientX, clientY) => {
        const svg = svgRef.current;
        if (!svg) return {x: 0, y: 0};
        const ctm = svg.getScreenCTM();
        if (!ctm) return {x: 0, y: 0};
        const inv = ctm.inverse();
        return {
            x: (inv.a * clientX) + (inv.c * clientY) + inv.e,
            y: (inv.b * clientX) + (inv.d * clientY) + inv.f
        };
    }, []);

    const handleSpriteDragStart = useCallback((e, spriteId) => {
        e.stopPropagation();
        e.preventDefault();
        const svgPt = screenToSVG(e.clientX, e.clientY);
        dragRef.current = {
            spriteId,
            startX: svgPt.x,
            startY: svgPt.y,
            hasMoved: false
        };
        setDraggingSpriteId(spriteId);
    }, [screenToSVG]);

    const handleMouseMove = useCallback(e => {
        if (!dragRef.current) return;
        const svgPt = screenToSVG(e.clientX, e.clientY);
        const dx = svgPt.x - dragRef.current.startX;
        const dy = svgPt.y - dragRef.current.startY;
        if (!dragRef.current.hasMoved &&
            (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
            dragRef.current.hasMoved = true;
        }
        if (!dragRef.current.hasMoved) return;
        const {spriteId} = dragRef.current;
        setPositionOverrides(prev => ({
            ...prev,
            [spriteId]: {
                dx: (prev[spriteId] ? prev[spriteId].prevDx : 0) + dx,
                dy: (prev[spriteId] ? prev[spriteId].prevDy : 0) + dy,
                prevDx: prev[spriteId] ? prev[spriteId].prevDx : 0,
                prevDy: prev[spriteId] ? prev[spriteId].prevDy : 0
            }
        }));
    }, [screenToSVG]);

    const handleMouseUp = useCallback(() => {
        if (!dragRef.current) return;
        const {spriteId, hasMoved} = dragRef.current;
        if (hasMoved) {
            // Commit the final position
            setPositionOverrides(prev => {
                const cur = prev[spriteId];
                if (!cur) return prev;
                return {
                    ...prev,
                    [spriteId]: {
                        dx: cur.dx,
                        dy: cur.dy,
                        prevDx: cur.dx,
                        prevDy: cur.dy
                    }
                };
            });
            // Keep hasMoved flag so click handler can check it,
            // then clear on next tick (click fires between mouseup
            // and the timeout)
            setTimeout(() => {
                dragRef.current = null;
            }, 0);
        } else {
            dragRef.current = null;
        }
        setDraggingSpriteId(null);
    }, []);

    // Attach document-level mouse handlers for drag
    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const handleBackgroundClick = useCallback(() => {
        setSelectedSprite(null);
    }, []);

    // Get effective position with drag overrides applied
    const getEffectivePos = useCallback((spriteId, basePos) => {
        const override = positionOverrides[spriteId];
        if (!override) return basePos;
        return {
            ...basePos,
            x: basePos.x + override.dx,
            y: basePos.y + override.dy,
            centerX: basePos.centerX + override.dx,
            centerY: basePos.centerY + override.dy
        };
    }, [positionOverrides]);

    // Look up sprite position with drag overrides applied
    const getSpritePos = useCallback(spriteId => {
        const base = layout ? layout.spritePositions[spriteId] : null;
        if (!base) return null;
        return getEffectivePos(spriteId, base);
    }, [layout, getEffectivePos]);

    const getOpacity = useCallback((type, key) => {
        if (!highlighted) return COLORS.normal;
        const set = highlighted[type];
        return set && set.has(key) ? COLORS.highlighted : COLORS.dimmed;
    }, [highlighted]);

    // Detail panel target: hover takes priority over selected
    const detailTarget = hoverTarget || (selectedSprite ? {type: 'sprite', data: selectedSprite} : null);

    if (!isOpen) return null;

    return (
        <ReactModal
            isOpen={isOpen}
            onRequestClose={onClose}
            className={styles.structureModalContainer}
            overlayClassName={styles.structureModalOverlay}
        >
            {/* Header */}
            <div className={styles.modalHeader}>
                <div className={styles.headerTitle}>
                    <span>Structure View</span>
                    {structure && (
                        <span className={styles.headerStats}>
                            {`${structure.sprites.length} sprites · ${structure.events.length} events · ${structure.broadcasts.length} broadcasts · ${structure.globals.length} variables`}
                        </span>
                    )}
                </div>
                <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                    <button
                        className={styles.closeButton}
                        onClick={onClose}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20">
                            <line
                                x1="5" y1="5" x2="15" y2="15"
                                stroke="white" strokeWidth="2" strokeLinecap="round"
                            />
                            <line
                                x1="15" y1="5" x2="5" y2="15"
                                stroke="white" strokeWidth="2" strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className={styles.modalBody}>
                <div className={styles.svgContainer}>
                    {(!structure || structure.sprites.length === 0) ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyStateIcon}>🔍</div>
                            <div>No sprites found in project</div>
                        </div>
                    ) : (
                        <React.Fragment>
                        <div className={styles.zoomControls}>
                            <button
                                className={styles.zoomButton}
                                onClick={handleZoomIn}
                                title="Zoom in"
                            >
                                +
                            </button>
                            <button
                                className={classNames(
                                    styles.zoomButton,
                                    styles.zoomLabel
                                )}
                                onClick={handleZoomReset}
                                title="Reset zoom"
                            >
                                {`${Math.round(zoom * 100)}%`}
                            </button>
                            <button
                                className={styles.zoomButton}
                                onClick={handleZoomOut}
                                title="Zoom out"
                            >
                                −
                            </button>
                        </div>
                        <svg
                            ref={svgRef}
                            className={styles.svgCanvas}
                            viewBox={(() => {
                                const vbW = layout.viewBox.width / zoom;
                                const vbH = layout.viewBox.height / zoom;
                                const vbX = layout.viewBox.x +
                                    (layout.viewBox.width - vbW) / 2;
                                const vbY = layout.viewBox.y +
                                    (layout.viewBox.height - vbH) / 2;
                                return `${vbX} ${vbY} ${vbW} ${vbH}`;
                            })()}
                            preserveAspectRatio="xMidYMid meet"
                            onClick={handleBackgroundClick}
                        >
                            {/* Zone labels */}
                            <text className={styles.zoneLabel} x={12} y={layout.zones.eventY - 8}>
                                EVENTS
                            </text>
                            <text className={styles.zoneLabel} x={12} y={layout.zones.spriteY - 8}>
                                SPRITES
                            </text>
                            {structure.globals.length > 0 && (
                                <text
                                    className={styles.zoneLabel}
                                    x={12}
                                    y={layout.zones.sharedStateY - 8}
                                >
                                    VARIABLES
                                </text>
                            )}

                            {/* Zone separator lines */}
                            <line
                                x1={0} y1={layout.zones.spriteY - 20}
                                x2={layout.viewBox.width} y2={layout.zones.spriteY - 20}
                                stroke="#eee" strokeWidth={1}
                            />
                            {structure.globals.length > 0 && (
                                <line
                                    x1={0} y1={layout.zones.sharedStateY - 20}
                                    x2={layout.viewBox.width} y2={layout.zones.sharedStateY - 20}
                                    stroke="#eee" strokeWidth={1}
                                />
                            )}

                            {/* ── Connection layer (below nodes) ── */}

                            {/* Event → Sprite arrows */}
                            {structure.events.map(event => {
                                const ePos = layout.eventPositions[event.id];
                                if (!ePos) return null;
                                const eventOpacity = getOpacity('events', event.id);
                                return event.sprites.map(spriteName => {
                                    const sprite = structure.sprites.find(
                                        s => s.name === spriteName
                                    );
                                    if (!sprite) return null;
                                    const sPos = getSpritePos(sprite.id);
                                    if (!sPos) return null;
                                    const spriteOpacity = getOpacity('sprites', spriteName);
                                    const arrowOpacity = Math.min(eventOpacity, spriteOpacity);
                                    return (
                                        <CurvedArrow
                                            key={`evt-${event.id}-${spriteName}`}
                                            x1={ePos.centerX}
                                            y1={ePos.y + ePos.height}
                                            x2={sPos.centerX}
                                            y2={sPos.y}
                                            color={getEventColor(event.type)}
                                            opacity={arrowOpacity}
                                            arrowHead
                                            strokeWidth={1.2}
                                            curveOffset={0}
                                        />
                                    );
                                });
                            })}

                            {/* Broadcast arrows (sprite → sprite) */}
                            {structure.broadcasts.map((bc, bcIdx) => {
                                const bcOpacity = getOpacity('broadcasts', bc.message);
                                const isHighlighted = highlighted &&
                                    highlighted.broadcasts.has(bc.message);
                                return bc.senders.map(sender => {
                                    const senderSprite = structure.sprites.find(
                                        s => s.name === sender.sprite
                                    );
                                    if (!senderSprite) return null;
                                    const sPos = getSpritePos(senderSprite.id);
                                    if (!sPos) return null;

                                    return bc.receivers.map((receiver, rIdx) => {
                                        const recvSprite = structure.sprites.find(
                                            s => s.name === receiver
                                        );
                                        if (!recvSprite) return null;
                                        const rPos = getSpritePos(recvSprite.id);
                                        if (!rPos) return null;

                                        // Self-loop
                                        const isSelfLoop = sender.sprite === receiver;
                                        const curveOff = isSelfLoop ? 40 :
                                            (bcIdx * 8) + (rIdx * 4);

                                        return (
                                            <g
                                                key={`bc-${bc.message}-${sender.sprite}-${receiver}`}
                                                onMouseEnter={() => setHoverTarget({
                                                    type: 'broadcast',
                                                    data: bc
                                                })}
                                                onMouseLeave={() => setHoverTarget(null)}
                                            >
                                                <CurvedArrow
                                                    x1={sPos.centerX}
                                                    y1={sPos.centerY}
                                                    x2={rPos.centerX}
                                                    y2={isSelfLoop ?
                                                        rPos.centerY - 20 :
                                                        rPos.centerY}
                                                    color={COLORS.broadcastArrow}
                                                    dashed={!isHighlighted}
                                                    opacity={bcOpacity}
                                                    arrowHead
                                                    strokeWidth={
                                                        isHighlighted ? 2.5 : 1.5
                                                    }
                                                    curveOffset={curveOff}
                                                />
                                                {/* Label on highlighted */}
                                                {isHighlighted && (
                                                    <text
                                                        x={(sPos.centerX + rPos.centerX) / 2}
                                                        y={(sPos.centerY + rPos.centerY) / 2 -
                                                            curveOff / 2 - 6}
                                                        textAnchor="middle"
                                                        fill={COLORS.broadcast}
                                                        fontSize="9"
                                                        fontWeight="600"
                                                        fontFamily="sans-serif"
                                                        pointerEvents="none"
                                                    >
                                                        {bc.message}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    });
                                });
                            })}

                            {/* Global ↔ Sprite lines */}
                            {structure.globals.map(g => {
                                const gPos = layout.globalPositions[g.id];
                                if (!gPos) return null;
                                const gOpacity = getOpacity('globals', g.id);
                                const color = g.type === 'list' ? COLORS.list : COLORS.variable;

                                return (
                                    <g key={`global-lines-${g.id}`}>
                                        {g.writers.map(writerName => {
                                            const sprite = structure.sprites.find(
                                                s => s.name === writerName
                                            );
                                            if (!sprite) return null;
                                            const sPos = getSpritePos(sprite.id);
                                            if (!sPos) return null;
                                            return (
                                                <CurvedArrow
                                                    key={`gw-${g.id}-${writerName}`}
                                                    x1={sPos.centerX}
                                                    y1={sPos.y + sPos.height}
                                                    x2={gPos.centerX}
                                                    y2={gPos.y}
                                                    color={color}
                                                    opacity={gOpacity}
                                                    arrowHead
                                                    strokeWidth={1.5}
                                                />
                                            );
                                        })}
                                        {g.readers.map(readerName => {
                                            const sprite = structure.sprites.find(
                                                s => s.name === readerName
                                            );
                                            if (!sprite) return null;
                                            const sPos = getSpritePos(sprite.id);
                                            if (!sPos) return null;
                                            return (
                                                <CurvedArrow
                                                    key={`gr-${g.id}-${readerName}`}
                                                    x1={gPos.centerX}
                                                    y1={gPos.y}
                                                    x2={sPos.centerX}
                                                    y2={sPos.y + sPos.height}
                                                    color={color}
                                                    dashed
                                                    opacity={gOpacity}
                                                    strokeWidth={1}
                                                />
                                            );
                                        })}
                                    </g>
                                );
                            })}

                            {/* Clone arrows */}
                            {structure.cloneRelationships.map(clone => {
                                const creatorSprite = structure.sprites.find(
                                    s => s.name === clone.creator
                                );
                                const targetSprite = structure.sprites.find(
                                    s => s.name === clone.target
                                );
                                if (!creatorSprite || !targetSprite) return null;
                                const cPos = getSpritePos(creatorSprite.id);
                                const tPos = getSpritePos(targetSprite.id);
                                if (!cPos || !tPos) return null;
                                const cOpacity = Math.min(
                                    getOpacity('sprites', clone.creator),
                                    getOpacity('sprites', clone.target)
                                );
                                return (
                                    <CurvedArrow
                                        key={`clone-${clone.creator}-${clone.target}`}
                                        x1={cPos.centerX}
                                        y1={cPos.y + cPos.height - 10}
                                        x2={clone.creator === clone.target ?
                                            tPos.centerX + 20 : tPos.centerX}
                                        y2={clone.creator === clone.target ?
                                            tPos.y + tPos.height - 10 :
                                            tPos.y + tPos.height - 10}
                                        color={COLORS.clone}
                                        opacity={cOpacity}
                                        arrowHead
                                        strokeWidth={1.5}
                                        curveOffset={
                                            clone.creator === clone.target ? 35 : 15
                                        }
                                    />
                                );
                            })}

                            {/* Sensing lines */}
                            {structure.sensingRelationships.map(sense => {
                                const sensorSprite = structure.sprites.find(
                                    s => s.name === sense.sensor
                                );
                                const targetSprite = structure.sprites.find(
                                    s => s.name === sense.target
                                );
                                if (!sensorSprite || !targetSprite) return null;
                                const sPos = getSpritePos(sensorSprite.id);
                                const tPos = getSpritePos(targetSprite.id);
                                if (!sPos || !tPos) return null;
                                const sOpacity = Math.min(
                                    getOpacity('sprites', sense.sensor),
                                    getOpacity('sprites', sense.target)
                                );
                                return (
                                    <CurvedArrow
                                        key={`sense-${sense.sensor}-${sense.target}-${sense.type}`}
                                        x1={sPos.centerX}
                                        y1={sPos.centerY + 10}
                                        x2={tPos.centerX}
                                        y2={tPos.centerY + 10}
                                        color={COLORS.sensing}
                                        dashed
                                        opacity={sOpacity}
                                        strokeWidth={1}
                                        curveOffset={-20}
                                    />
                                );
                            })}

                            {/* ── Node layer (above connections) ── */}

                            {/* Event bubbles */}
                            {structure.events.map(event => {
                                const pos = layout.eventPositions[event.id];
                                if (!pos) return null;
                                return (
                                    <EventBubble
                                        key={event.id}
                                        event={event}
                                        pos={pos}
                                        opacity={getOpacity('events', event.id)}
                                        onMouseEnter={() => setHoverTarget({
                                            type: 'event',
                                            data: event
                                        })}
                                        onMouseLeave={() => setHoverTarget(null)}
                                    />
                                );
                            })}

                            {/* Sprite nodes */}
                            {structure.sprites.map(sprite => {
                                const pos = getSpritePos(sprite.id);
                                if (!pos) return null;
                                return (
                                    <SpriteNode
                                        key={sprite.id}
                                        sprite={sprite}
                                        pos={pos}
                                        thumbnailUrl={thumbnails[sprite.id]}
                                        opacity={getOpacity('sprites', sprite.name)}
                                        isSelected={
                                            selectedSprite &&
                                            selectedSprite.name === sprite.name
                                        }
                                        isDragging={
                                            draggingSpriteId === sprite.id
                                        }
                                        onMouseEnter={() => setHoverTarget({
                                            type: 'sprite',
                                            data: sprite
                                        })}
                                        onMouseLeave={() => setHoverTarget(null)}
                                        onDragStart={e => handleSpriteDragStart(
                                            e, sprite.id
                                        )}
                                        onClick={e => {
                                            e.stopPropagation();
                                            if (dragRef.current &&
                                                dragRef.current.hasMoved) {
                                                return;
                                            }
                                            setSelectedSprite(
                                                selectedSprite &&
                                                selectedSprite.name === sprite.name ?
                                                    null : sprite
                                            );
                                        }}
                                    />
                                );
                            })}

                            {/* Global bubbles */}
                            {structure.globals.map(g => {
                                const pos = layout.globalPositions[g.id];
                                if (!pos) return null;
                                return (
                                    <GlobalBubble
                                        key={g.id}
                                        global={g}
                                        pos={pos}
                                        opacity={getOpacity('globals', g.id)}
                                        onMouseEnter={() => setHoverTarget({
                                            type: 'global',
                                            data: g
                                        })}
                                        onMouseLeave={() => setHoverTarget(null)}
                                    />
                                );
                            })}
                        </svg>
                        </React.Fragment>
                    )}
                </div>

                {/* Detail panel */}
                {structure && (
                    <DetailPanel
                        hoverTarget={detailTarget}
                        structure={structure}
                    />
                )}
            </div>

            {/* Legend bar */}
            <div className={styles.legendContainer}>
                <div className={styles.legendItem}>
                    <div
                        className={styles.legendLine}
                        style={{background: COLORS.greenFlag}}
                    />
                    Event triggers
                </div>
                <div className={styles.legendItem}>
                    <div
                        className={styles.legendLineDashed}
                        style={{borderColor: COLORS.broadcastArrow}}
                    />
                    Broadcast
                </div>
                <div className={styles.legendItem}>
                    <div
                        className={styles.legendLine}
                        style={{background: COLORS.variable}}
                    />
                    Variable (write)
                </div>
                <div className={styles.legendItem}>
                    <div
                        className={styles.legendLineDashed}
                        style={{borderColor: COLORS.variable}}
                    />
                    Variable (read)
                </div>
                <div className={styles.legendItem}>
                    <div
                        className={styles.legendLine}
                        style={{background: COLORS.list}}
                    />
                    List
                </div>
                <div className={styles.legendItem}>
                    <div
                        className={styles.legendLine}
                        style={{background: COLORS.clone}}
                    />
                    Clone
                </div>
                <div className={styles.legendItem}>
                    <div
                        className={styles.legendLineDashed}
                        style={{borderColor: COLORS.sensing}}
                    />
                    Sensing
                </div>
            </div>
        </ReactModal>
    );
};

StructureView.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.object
};

export default StructureView;
