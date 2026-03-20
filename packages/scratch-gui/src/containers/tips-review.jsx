import {connect} from 'react-redux';

import TipsReviewComponent from '../components/tips-review/tips-review.jsx';
import {closeTipsReview} from '../reducers/modals';

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeTipsReview())
});

export default connect(
    null,
    mapDispatchToProps
)(TipsReviewComponent);
