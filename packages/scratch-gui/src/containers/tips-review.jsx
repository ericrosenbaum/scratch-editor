import {connect} from 'react-redux';

import TipsReviewComponent from '../components/tips-review/tips-review.jsx';
import {closeTipsReview} from '../reducers/modals';

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeTipsReview())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(TipsReviewComponent);
