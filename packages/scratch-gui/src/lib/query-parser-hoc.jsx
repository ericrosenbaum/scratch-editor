import React from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import {connect} from 'react-redux';

import {detectTutorialId, detectMicroworldId} from './tutorial-from-url';

import {activateDeck} from '../reducers/cards';
import {startMicroworld} from '../reducers/microworlds';
import {openTipsLibrary} from '../reducers/modals';

/* Higher Order Component to get parameters from the URL query string and initialize redux state
 * @param {React.Component} WrappedComponent: component to render
 * @returns {React.Component} component with query parsing behavior
 */
const QueryParserHOC = function (WrappedComponent) {
    class QueryParserComponent extends React.Component {
        constructor (props) {
            super(props);
            const queryParams = queryString.parse(location.search);
            const microworldId = detectMicroworldId(queryParams);
            if (microworldId) {
                this.props.onStartMicroworld(microworldId);
            }
            const tutorialId = detectTutorialId(queryParams);
            if (tutorialId) {
                if (tutorialId === 'all') {
                    this.openTutorials();
                } else {
                    this.setActiveCards(tutorialId);
                }
            }
        }
        setActiveCards (tutorialId) {
            this.props.onUpdateReduxDeck(tutorialId);
        }
        openTutorials () {
            this.props.onOpenTipsLibrary();
        }
        render () {
            const {
                onOpenTipsLibrary,
                onStartMicroworld,
                onUpdateReduxDeck,
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent
                    {...componentProps}
                />
            );
        }
    }
    QueryParserComponent.propTypes = {
        onOpenTipsLibrary: PropTypes.func,
        onStartMicroworld: PropTypes.func,
        onUpdateReduxDeck: PropTypes.func
    };
    const mapDispatchToProps = dispatch => ({
        onOpenTipsLibrary: () => {
            dispatch(openTipsLibrary());
        },
        onStartMicroworld: worldId => {
            dispatch(startMicroworld(worldId));
        },
        onUpdateReduxDeck: tutorialId => {
            dispatch(activateDeck(tutorialId));
        }
    });
    return connect(
        null,
        mapDispatchToProps
    )(QueryParserComponent);
};

export {
    QueryParserHOC as default
};
