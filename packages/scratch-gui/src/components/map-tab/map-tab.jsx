import React, {useState, useEffect, useRef} from 'react';
import {connect} from 'react-redux';
import styles from './map-tab.css';
import catFlyingThumb from './sprite--cat-flying.svg';
import caseyThumb from './sprite--casey.svg';
import benThumb from './sprite--ben.svg';
import stageThumb from './sprite--stage.svg';

const MAP_DATA = {
    title: 'Dance Party',
    description: 'Three characters dance to a music loop on a colorful dance floor',
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
                        'Glide [[40]] steps each way.',
                        'Each glide takes [[0.5]] seconds.',
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
                        'Change to the next costume every [[0.5]] seconds.'
                    ]
                },
                {
                    event: 'when green flag clicked',
                    description: 'After a short wait, the person suggests joining in.',
                    details: [
                        'Wait [[2]] seconds.',
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
                        'Change to the next costume every [[0.5]] seconds.'
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
                        'Switch to the next backdrop every [[0.25]] seconds.'
                    ]
                }
            ]
        }
    ]
};

// Parse a detail string into segments: plain text, editable value, or menu value.
// e.g. "Wait [[2]] seconds." → [{type:'text', content:'Wait '}, {type:'value', content:'2'}, {type:'text', content:' seconds.'}]
// e.g. "[[cat-a|menu=looks_costume]]" → [{type:'menu', content:'cat-a', menuId:'looks_costume'}]
function parseDetail (text) {
    const parts = [];
    const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
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

function DetailText ({text}) {
    const parts = parseDetail(text);
    return (
        <span>
            {parts.map((part, i) => {
                if (part.type === 'value') {
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

function MapTab ({editingTargetName}) {
    const [expandedSprites, setExpandedSprites] = useState(new Set());
    const [expandedBehaviors, setExpandedBehaviors] = useState(new Set());
    const spriteRefs = useRef([]);

    useEffect(() => {
        const idx = MAP_DATA.sprites.findIndex(s => s.name === editingTargetName);
        if (idx >= 0 && spriteRefs.current[idx]) {
            spriteRefs.current[idx].scrollIntoView({behavior: 'smooth', block: 'nearest'});
        }
    }, [editingTargetName]);

    const toggleSprite = si => {
        setExpandedSprites(prev => {
            const next = new Set(prev);
            if (next.has(si)) next.delete(si);
            else next.add(si);
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

    return (
        <div className={styles.mapTab}>
            <div className={styles.projectHeader}>
                <div className={styles.projectTitle}>{MAP_DATA.title}</div>
                <div className={styles.projectDescription}>{MAP_DATA.description}</div>
            </div>

            <div className={styles.spriteList}>
                {MAP_DATA.sprites.map((sprite, si) => {
                    const spriteExpanded = expandedSprites.has(si);
                    const isSelected = sprite.name === editingTargetName;
                    return (
                        <div
                            key={si}
                            ref={el => { spriteRefs.current[si] = el; }}
                            className={`${styles.spriteSection}${isSelected ? ` ${styles.isSelected}` : ''}`}
                        >
                            <div
                                className={styles.spriteHeader}
                                onClick={() => toggleSprite(si)}
                            >
                                <span className={styles.chevron}>
                                    {spriteExpanded ? '▼' : '▶'}
                                </span>
                                <span className={styles.spriteThumbnailContainer}>
                                    {sprite.thumbnail && (
                                        <img
                                            className={styles.spriteThumbnail}
                                            draggable={false}
                                            src={sprite.thumbnail}
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
                                        const key = `${si}-${bi}`;
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
                })}
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

    return {editingTargetName};
};

export default connect(mapStateToProps)(MapTab);
