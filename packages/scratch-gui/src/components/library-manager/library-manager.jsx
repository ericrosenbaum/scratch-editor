/* eslint-disable react/no-multi-comp */
// BlockRow and LibraryCard are small presentational helpers tightly coupled to
// this manager; keeping them here (rather than separate files) reads better.
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';

import styles from './library-manager.css';

const TYPE_LABELS = {
    'command': 'command',
    'reporter': 'reporter',
    'boolean': 'boolean',
    'c-loop': 'loop',
    'c-if': 'if',
    'hat': 'hat'
};

/** One block row, with its own bound handlers (so JSX props stay stable). */
class BlockRow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleEdit', 'handleDelete']);
    }
    handleEdit () {
        this.props.onEdit(this.props.libraryId, this.props.block);
    }
    handleDelete () {
        this.props.onDelete(this.props.libraryId, this.props.block.opcode);
    }
    render () {
        const {block} = this.props;
        return (
            <li className={styles.blockRow}>
                <span className={styles.blockType}>{TYPE_LABELS[block.type] || block.type}</span>
                <span className={styles.blockLabel}>{block.signature.text.replace(/\[(\w+)\]/g, '($1)')}</span>
                <span className={styles.blockActions}>
                    <button
                        className={styles.smallButton}
                        onClick={this.handleEdit}
                    >{'Edit'}</button>
                    <button
                        className={styles.smallButtonDanger}
                        onClick={this.handleDelete}
                    >{'Delete'}</button>
                </span>
            </li>
        );
    }
}

BlockRow.propTypes = {
    block: PropTypes.object,
    libraryId: PropTypes.string,
    onDelete: PropTypes.func,
    onEdit: PropTypes.func
};

/** A button that adds a built-in example library. */
class ExampleButton extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick']);
    }
    handleClick () {
        this.props.onAdd(this.props.name);
    }
    render () {
        return (
            <button
                className={styles.secondaryButton}
                data-testid={`js-add-example-${this.props.name}`}
                onClick={this.handleClick}
            >{`+ ${this.props.name}`}</button>
        );
    }
}

ExampleButton.propTypes = {
    name: PropTypes.string,
    onAdd: PropTypes.func
};

/** A button that loads an example starter project (library + script). */
class ProjectButton extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick']);
    }
    handleClick () {
        this.props.onLoad(this.props.project.id);
    }
    render () {
        return (
            <button
                className={styles.secondaryButton}
                title={this.props.project.blurb}
                data-testid={`js-load-project-${this.props.project.id}`}
                onClick={this.handleClick}
            >{this.props.project.name}</button>
        );
    }
}

ProjectButton.propTypes = {
    project: PropTypes.object,
    onLoad: PropTypes.func
};

/** One library card, with bound handlers for its actions. */
class LibraryCard extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleNewBlock', 'handleExport', 'handleDelete']);
    }
    handleNewBlock () {
        this.props.onNewBlock(this.props.library.id);
    }
    handleExport () {
        this.props.onExport(this.props.library.id);
    }
    handleDelete () {
        this.props.onDeleteLibrary(this.props.library.id);
    }
    render () {
        const {library} = this.props;
        return (
            <Box
                className={styles.library}
                data-testid={`js-library-${library.id}`}
            >
                <Box className={styles.libraryHeader}>
                    <span
                        className={styles.swatch}
                        style={{backgroundColor: library.color1 || '#9966FF'}}
                    />
                    <span className={styles.libraryName}>{library.name}</span>
                    <span className={styles.libraryActions}>
                        <button
                            className={styles.smallButton}
                            data-testid={`js-new-block-${library.id}`}
                            onClick={this.handleNewBlock}
                        >{'+ Block'}</button>
                        <button
                            className={styles.smallButton}
                            onClick={this.handleExport}
                        >{'Export'}</button>
                        <button
                            className={styles.smallButtonDanger}
                            onClick={this.handleDelete}
                        >{'Delete'}</button>
                    </span>
                </Box>
                {library.blocks.length === 0 ? (
                    <p className={styles.emptyBlocks}>{'No blocks yet — add one.'}</p>
                ) : (
                    <ul className={styles.blockList}>
                        {library.blocks.map(block => (
                            <BlockRow
                                key={block.opcode}
                                libraryId={library.id}
                                block={block}
                                onEdit={this.props.onEditBlock}
                                onDelete={this.props.onDeleteBlock}
                            />
                        ))}
                    </ul>
                )}
            </Box>
        );
    }
}

LibraryCard.propTypes = {
    library: PropTypes.object,
    onDeleteBlock: PropTypes.func,
    onDeleteLibrary: PropTypes.func,
    onEditBlock: PropTypes.func,
    onExport: PropTypes.func,
    onNewBlock: PropTypes.func
};

const LibraryManager = props => (
    <Modal
        className={styles.modalContent}
        contentLabel="My Block Libraries"
        onRequestClose={props.onRequestClose}
        id="libraryManager"
    >
        <Box className={styles.body}>
            <Box className={styles.topRow}>
                <p className={styles.intro}>
                    {'Create your own blocks with JavaScript, grouped into libraries.'}
                </p>
                <span>
                    <button
                        className={styles.primaryButton}
                        data-testid="js-new-library"
                        onClick={props.onNewLibrary}
                    >{'New library'}</button>
                    <button
                        className={styles.secondaryButton}
                        data-testid="js-import-library"
                        onClick={props.onImport}
                    >{'Import…'}</button>
                </span>
            </Box>

            <Box className={styles.execModeRow}>
                <label className={styles.execModeToggle}>
                    <input
                        type="checkbox"
                        checked={props.directExecution}
                        data-testid="js-direct-execution-toggle"
                        onChange={props.onToggleDirectExecution}
                    />
                    {'Run JavaScript directly (no interpreter)'}
                </label>
                {props.directExecution ? (
                    <span className={styles.execModeWarning}>
                        {'⚠️ experimental — no sandbox, an infinite loop will freeze the page'}
                    </span>
                ) : (
                    <span className={styles.execModeNote}>
                        {'Blocks run in a sandboxed interpreter. Turn on to compare performance.'}
                    </span>
                )}
            </Box>

            <Box className={styles.examplesRow}>
                <span className={styles.examplesLabel}>{'Add an example library:'}</span>
                {props.examples.map(example => (
                    <ExampleButton
                        key={example.name}
                        name={example.name}
                        onAdd={props.onAddExample}
                    />
                ))}
            </Box>

            <Box className={styles.examplesRow}>
                <span className={styles.examplesLabel}>{'Load an example project:'}</span>
                {props.projects.map(project => (
                    <ProjectButton
                        key={project.id}
                        project={project}
                        onLoad={props.onLoadProject}
                    />
                ))}
            </Box>

            {props.libraries.length === 0 ? (
                <p className={styles.empty}>{'No libraries yet. Create one to get started.'}</p>
            ) : (
                <Box className={styles.libraryList}>
                    {props.libraries.map(library => (
                        <LibraryCard
                            key={library.id}
                            library={library}
                            onNewBlock={props.onNewBlock}
                            onExport={props.onExport}
                            onDeleteLibrary={props.onDeleteLibrary}
                            onEditBlock={props.onEditBlock}
                            onDeleteBlock={props.onDeleteBlock}
                        />
                    ))}
                </Box>
            )}
        </Box>
    </Modal>
);

LibraryManager.propTypes = {
    directExecution: PropTypes.bool,
    examples: PropTypes.arrayOf(PropTypes.object),
    onAddExample: PropTypes.func,
    projects: PropTypes.arrayOf(PropTypes.object),
    onLoadProject: PropTypes.func,
    libraries: PropTypes.arrayOf(PropTypes.object),
    onDeleteBlock: PropTypes.func,
    onDeleteLibrary: PropTypes.func,
    onEditBlock: PropTypes.func,
    onExport: PropTypes.func,
    onImport: PropTypes.func,
    onNewBlock: PropTypes.func,
    onNewLibrary: PropTypes.func,
    onRequestClose: PropTypes.func,
    onToggleDirectExecution: PropTypes.func
};

export default LibraryManager;
