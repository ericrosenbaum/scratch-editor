import React, {useState, useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {connect} from 'react-redux';
import styles from './map-tab.css';
import getCostumeUrl from '../../lib/get-costume-url';
import catFlyingThumb from './sprite--cat-flying.svg';
import caseyThumb from './sprite--casey.svg';
import benThumb from './sprite--ben.svg';
import stageThumb from './sprite--stage.svg';

const MAP_DATA = {
    title: 'Dance Party',
    description: 'Three characters dance to a music loop on a colorful dance floor',
    spriteOrder: ['Cat Flying', 'Casey', 'Ben', 'Stage'],
    groups: [
        {
            name: 'Dancers',
            description: 'Characters that dance in a loop to the music.',
            spriteNames: ['Casey', 'Ben']
        }
    ],
    sprites: [
        {
            name: 'Cat Flying',
            thumbnail: catFlyingThumb,
            description: 'A flying cat sprite that glides back and forth across the stage.',
            behaviors: [
                {
                    event: 'when green flag clicked',
                    description: 'The cat glides left and right in a loop',
                    details: [
                        'Glide [[40|range=0:240]] steps each way.',
                        'Each glide takes [[0.5|range=0:5:0.1]] seconds.',
                        'Switch costume between [[cat-flying-a|menu=looks_costume]] and [[cat-flying-a2|menu=looks_costume]] to face the direction of motion.'
                    ]
                }
            ]
        },
        {
            name: 'Casey',
            thumbnail: caseyThumb,
            description: 'A dancing person who also invites the audience to remix the project.',
            behaviors: [
                {
                    event: 'when green flag clicked',
                    description: 'The person dances by changing costumes in a loop.',
                    details: [
                        'Change to the next costume every [[0.5|range=0:5:0.1]] seconds.'
                    ]
                },
                {
                    event: 'when green flag clicked',
                    description: 'After a short wait, the person suggests joining in.',
                    details: [
                        'Wait [[2|range=0:30]] seconds.',
                        'Say [[Join the dance party by remixing this project and adding another sprite!]].'
                    ]
                }
            ]
        },
        {
            name: 'Ben',
            thumbnail: benThumb,
            description: 'A second dancing person who dances in sync with Casey.',
            behaviors: [
                {
                    event: 'when green flag clicked',
                    description: 'The person dances by changing costumes in a loop.',
                    details: [
                        'Change to the next costume every [[0.5|range=0:5:0.1]] seconds.'
                    ]
                }
            ]
        },
        {
            name: 'Stage',
            thumbnail: stageThumb,
            description: 'The colorful dance floor backdrop that pulses and plays music.',
            behaviors: [
                {
                    event: 'when green flag clicked',
                    description: 'The dancefloor plays music and animates a colorful floor.',
                    details: [
                        'Play sound [[Dance Energetic|menu=sound_sounds_menu]] in a loop.',
                        'Switch to the next backdrop every [[0.25|range=0:5:0.05]] seconds.'
                    ]
                }
            ]
        }
    ]
};

// Guess a reasonable slider step from the default value string.
// "40" → 1, "0.5" → 0.1, "0.25" → 0.05
function guessStep (valueStr) {
    const dot = valueStr.indexOf('.');
    if (dot < 0) return 1;
    return Math.pow(10, -(valueStr.length - dot - 1));
}

// Parse a detail string into segments: plain text, editable value, or menu value.
// e.g. "Wait [[2]] seconds." → [{type:'text', content:'Wait '}, ...]
// e.g. "[[40|range=0:240]]" → [{type:'value', content:'40', min:0, max:240, step:1}]
// e.g. "[[0.5|range=0:5:0.1]]" → [{type:'value', content:'0.5', min:0, max:5, step:0.1}]
// e.g. "[[cat-a|menu=looks_costume]]" → [{type:'menu', content:'cat-a', menuId:'looks_costume'}]
function parseDetail (text) {
    const parts = [];
    const regex = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push({type: 'text', content: text.slice(lastIndex, match.index)});
        }
        const value = match[1];
        const meta = match[2];
        if (meta && meta.startsWith('menu=')) {
            parts.push({type: 'menu', content: value, menuId: meta.slice(5)});
        } else if (meta && meta.startsWith('range=')) {
            const rangeParts = meta.slice(6).split(':');
            const min = parseFloat(rangeParts[0]);
            const max = parseFloat(rangeParts[1]);
            const step = rangeParts[2] !== undefined ? parseFloat(rangeParts[2]) : guessStep(value);
            parts.push({type: 'value', content: value, min, max, step});
        } else {
            parts.push({type: 'value', content: value});
        }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
        parts.push({type: 'text', content: text.slice(lastIndex)});
    }
    return parts;
}

// Numeric input with a vertical slider popup for values that have a range specified.
function InlineNumericInput ({defaultValue, min, max, step}) {
    const [value, setValue] = useState(defaultValue);
    const [popupAnchor, setPopupAnchor] = useState(null);
    const inputRef = useRef(null);
    const popupRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        if (!popupAnchor) return;
        const handlePointerDown = e => {
            if (
                popupRef.current && !popupRef.current.contains(e.target) &&
                inputRef.current && !inputRef.current.contains(e.target)
            ) {
                setPopupAnchor(null);
            }
        };
        // Close on scroll (popup is fixed, input may move)
        const handleScroll = () => setPopupAnchor(null);
        document.addEventListener('pointerdown', handlePointerDown, true);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [popupAnchor]);

    const openSlider = () => {
        if (!inputRef.current) return;
        const rect = inputRef.current.getBoundingClientRect();
        setPopupAnchor({x: rect.left + rect.width / 2, y: rect.top - 6});
    };

    const numValue = parseFloat(value);
    const clampedValue = isNaN(numValue) ? min : Math.max(min, Math.min(max, numValue));

    return (
        <>
            <input
                ref={inputRef}
                className={`${styles.inlineInput}${popupAnchor ? ` ${styles.inlineInputActive}` : ''}`}
                value={value}
                size={Math.max(1, String(value).length)}
                onChange={e => setValue(e.target.value)}
                onClick={openSlider}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                        setPopupAnchor(null);
                        e.currentTarget.blur();
                    }
                }}
            />
            {popupAnchor && createPortal(
                <div
                    ref={popupRef}
                    className={styles.sliderPopup}
                    style={{
                        position: 'fixed',
                        left: popupAnchor.x,
                        top: popupAnchor.y,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    <div className={styles.sliderValue}>{value}</div>
                    <input
                        type="range"
                        className={styles.verticalSlider}
                        min={min}
                        max={max}
                        step={step}
                        value={clampedValue}
                        onChange={e => setValue(e.target.value)}
                    />
                </div>,
                document.body
            )}
        </>
    );
}

function DetailText ({text}) {
    const parts = parseDetail(text);
    return (
        <span>
            {parts.map((part, i) => {
                if (part.type === 'value') {
                    if (part.min !== undefined && part.max !== undefined) {
                        return (
                            <InlineNumericInput
                                key={i}
                                defaultValue={part.content}
                                min={part.min}
                                max={part.max}
                                step={part.step}
                            />
                        );
                    }
                    return (
                        <input
                            key={i}
                            className={styles.inlineInput}
                            defaultValue={part.content}
                            size={Math.max(1, part.content.length)}
                        />
                    );
                }
                if (part.type === 'menu') {
                    return (
                        <span
                            key={i}
                            className={styles.inlineMenu}
                            title={`menu: ${part.menuId}`}
                        >
                            {part.content}
                            {' ▾'}
                        </span>
                    );
                }
                return <span key={i}>{part.content}</span>;
            })}
        </span>
    );
}

function MapTab ({editingTargetName, vm, sprites, stage}) {
    const getThumbnailUrl = name => {
        if (!vm || !vm.runtime.storage) return null;
        const storage = vm.runtime.storage;
        const spriteEntry = sprites && Object.values(sprites).find(s => s.name === name);
        if (spriteEntry && spriteEntry.costume && spriteEntry.costume.asset) {
            return getCostumeUrl(storage, spriteEntry.costume.asset);
        }
        if (stage && stage.name === name && stage.costume && stage.costume.asset) {
            return getCostumeUrl(storage, stage.costume.asset);
        }
        return null;
    };

    const [mapData, setMapData] = useState(MAP_DATA);
    const [isGenerating, setIsGenerating] = useState(false);
    const [expandedSprites, setExpandedSprites] = useState(new Set());   // keyed by sprite name
    const [expandedBehaviors, setExpandedBehaviors] = useState(new Set()); // keyed by "SpriteName-bi"
    const [expandedGroups, setExpandedGroups] = useState(() => new Set((MAP_DATA.groups || []).map(g => g.name))); // keyed by group name
    const spriteRefs = useRef({});  // keyed by sprite name

    const generateMap = async () => {
        if (!vm || isGenerating) return;
        setIsGenerating(true);
        try {
            const projectJson = vm.toJSON();
            const response = await fetch('http://localhost:3000/api/generate-map', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({projectJson})
            });
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const {mapData: generated} = await response.json();
            setMapData(generated);
            setExpandedSprites(new Set());
            setExpandedBehaviors(new Set());
            setExpandedGroups(new Set((generated.groups || []).map(g => g.name)));
        } catch (err) {
            console.error('Failed to generate map:', err);
        } finally {
            setIsGenerating(false);
        }
    };

    useEffect(() => {
        if (editingTargetName && spriteRefs.current[editingTargetName]) {
            spriteRefs.current[editingTargetName].scrollIntoView({behavior: 'smooth', block: 'nearest'});
        }
    }, [editingTargetName]);

    const toggleSprite = name => {
        setExpandedSprites(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const toggleBehavior = key => {
        setExpandedBehaviors(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleGroup = name => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const renderSprite = sprite => {
        if (!sprite) return null;
        const spriteExpanded = expandedSprites.has(sprite.name);
        const isSelected = sprite.name === editingTargetName;
        const thumbnailUrl = getThumbnailUrl(sprite.name) || sprite.thumbnail;
        return (
            <div
                key={sprite.name}
                ref={el => { spriteRefs.current[sprite.name] = el; }}
                className={`${styles.spriteSection}${isSelected ? ` ${styles.isSelected}` : ''}`}
            >
                <div
                    className={styles.spriteHeader}
                    onClick={() => toggleSprite(sprite.name)}
                >
                    <span className={styles.chevron}>
                        {spriteExpanded ? '▼' : '▶'}
                    </span>
                    <span className={styles.spriteThumbnailContainer}>
                        {thumbnailUrl && (
                            <img
                                className={styles.spriteThumbnail}
                                draggable={false}
                                src={thumbnailUrl}
                            />
                        )}
                    </span>
                    <span className={styles.spriteHeaderText}>
                        <span className={styles.spriteName}>{sprite.name}</span>
                        {sprite.description && (
                            <span className={styles.spriteDescription}>{sprite.description}</span>
                        )}
                    </span>
                </div>

                {spriteExpanded && (
                    <div className={styles.behaviorList}>
                        {sprite.behaviors.map((behavior, bi) => {
                            const key = `${sprite.name}-${bi}`;
                            const behaviorExpanded = expandedBehaviors.has(key);
                            return (
                                <div
                                    key={bi}
                                    className={styles.behaviorSection}
                                >
                                    <div
                                        className={styles.behaviorHeader}
                                        onClick={() => toggleBehavior(key)}
                                    >
                                        <span className={styles.chevron}>
                                            {behaviorExpanded ? '▼' : '▶'}
                                        </span>
                                        <span className={styles.behaviorEvent}>{behavior.event}</span>
                                    </div>
                                    <div className={styles.behaviorDescription}>
                                        {behavior.description}
                                    </div>

                                    {behaviorExpanded && (
                                        <ul className={styles.detailList}>
                                            {behavior.details.map((detail, di) => (
                                                <li
                                                    key={di}
                                                    className={styles.detailItem}
                                                >
                                                    <DetailText text={detail} />
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const groups = mapData.groups || [];
    const groupedNames = new Set(groups.flatMap(g => g.spriteNames));
    const spriteByName = Object.fromEntries(mapData.sprites.map(s => [s.name, s]));
    const ungroupedSprites = mapData.sprites.filter(s => !groupedNames.has(s.name));

    return (
        <div className={styles.mapTab}>
            <div className={styles.projectHeader}>
                <div className={styles.projectTitle}>{mapData.title}</div>
                <div className={styles.projectDescription}>{mapData.description}</div>
                <button
                    className={styles.generateButton}
                    onClick={generateMap}
                    disabled={isGenerating}
                >
                    {isGenerating ? 'Generating…' : 'Generate'}
                </button>
            </div>

            <div className={styles.spriteList}>
                {groups.map(group => {
                    const groupExpanded = expandedGroups.has(group.name);
                    return (
                        <div
                            key={group.name}
                            className={styles.groupSection}
                        >
                            <div
                                className={styles.groupHeader}
                                onClick={() => toggleGroup(group.name)}
                            >
                                <span className={styles.chevron}>
                                    {groupExpanded ? '▼' : '▶'}
                                </span>
                                <span className={styles.groupHeaderText}>
                                    <span className={styles.groupName}>{group.name}</span>
                                    {group.description && (
                                        <span className={styles.groupDescription}>{group.description}</span>
                                    )}
                                </span>
                            </div>
                            {groupExpanded && (
                                <div className={styles.groupBody}>
                                    {group.spriteNames.map(name => renderSprite(spriteByName[name]))}
                                </div>
                            )}
                        </div>
                    );
                })}
                {ungroupedSprites.map(sprite => renderSprite(sprite))}
            </div>
        </div>
    );
}

const mapStateToProps = state => {
    const editingTarget = state.scratchGui.targets.editingTarget;
    const sprites = state.scratchGui.targets.sprites;
    const stage = state.scratchGui.targets.stage;

    let editingTargetName = null;
    if (editingTarget && sprites && sprites[editingTarget]) {
        editingTargetName = sprites[editingTarget].name;
    } else if (editingTarget && stage && stage.id === editingTarget) {
        editingTargetName = stage.name;
    }

    return {editingTargetName, vm: state.scratchGui.vm, sprites, stage};
};

export default connect(mapStateToProps)(MapTab);
