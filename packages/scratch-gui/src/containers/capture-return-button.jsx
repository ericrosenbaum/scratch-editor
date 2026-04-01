import {connect} from 'react-redux';

import CaptureReturnButtonComponent from '../components/tips-review/capture-return-button.jsx';
import {openTipsReview} from '../reducers/modals';

const mapDispatchToProps = (dispatch) => ({
    onOpen: () => dispatch(openTipsReview())
});

export default connect(
    null,
    mapDispatchToProps
)(CaptureReturnButtonComponent);
