import React, {useState, useCallback} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import AiCodeModalComponent from '../components/ai-code-modal/ai-code-modal.jsx';
import {closeAiCodeModal} from '../reducers/modals';
import {generate} from '../lib/ai-model-service';
import {buildPrompt} from '../lib/ai-code-system-prompt';

const AiCodeModal = ({isOpen, vm, onClose}) => {
    const [prompt, setPrompt] = useState('');
    const [generatedCode, setGeneratedCode] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);

    const handleClose = useCallback(() => {
        setPrompt('');
        setGeneratedCode('');
        setError(null);
        setIsGenerating(false);
        onClose();
    }, [onClose]);

    const handleSubmit = useCallback(async () => {
        if (!prompt.trim() || isGenerating) return;
        setIsGenerating(true);
        setError(null);
        setGeneratedCode('');
        try {
            const fullPrompt = buildPrompt(prompt.trim());
            const response = await generate(fullPrompt);
            setGeneratedCode(response.trim());
        } catch (err) {
            setError(`Generation failed: ${err.message}`);
        } finally {
            setIsGenerating(false);
        }
    }, [prompt, isGenerating]);

    const extractScripts = useCallback(text => {
        // Find the outermost JSON array in the response
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        if (firstBracket === -1 || lastBracket === -1) {
            throw new Error('No valid block data found in response');
        }
        let jsonStr = text.slice(firstBracket, lastBracket + 1);

        // Try parsing as-is first
        try {
            return JSON.parse(jsonStr);
        } catch (_) { /* try bracket repair */ }

        // Bracket repair: reduce runs of 3+ ] to ]]
        const cleaned = jsonStr.replace(/\]{3,}/g, ']]');
        try {
            return JSON.parse(cleaned);
        } catch (_) { /* keep trying */ }

        // Try trimming trailing brackets
        for (let trim = 1; trim <= 5; trim++) {
            try {
                return JSON.parse(jsonStr.slice(0, -trim));
            } catch (_) { /* keep trying */ }
        }

        // Try adding missing brackets
        for (let add = 1; add <= 3; add++) {
            try {
                return JSON.parse(jsonStr + ']'.repeat(add));
            } catch (_) { /* keep trying */ }
        }

        // If nothing worked, throw with original error
        return JSON.parse(jsonStr);
    }, []);

    const handleAddToSprite = useCallback(async () => {
        if (!generatedCode || !vm.editingTarget) return;
        setError(null);
        try {
            const scripts = extractScripts(generatedCode);
            await vm.shareSB2BlocksToTarget(scripts, vm.editingTarget.id);
            vm.refreshWorkspace();
            handleClose();
        } catch (err) {
            setError(`Failed to add blocks: ${err.message}`);
        }
    }, [generatedCode, vm, extractScripts, handleClose]);

    return (
        <AiCodeModalComponent
            error={error}
            generatedCode={generatedCode}
            isGenerating={isGenerating}
            isOpen={isOpen}
            prompt={prompt}
            onAddToSprite={handleAddToSprite}
            onClose={handleClose}
            onPromptChange={setPrompt}
            onSubmit={handleSubmit}
        />
    );
};

AiCodeModal.propTypes = {
    isOpen: PropTypes.bool,
    onClose: PropTypes.func,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = state => ({
    isOpen: state.scratchGui.modals.aiCodeModal
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeAiCodeModal())
});

export default connect(mapStateToProps, mapDispatchToProps)(AiCodeModal);
