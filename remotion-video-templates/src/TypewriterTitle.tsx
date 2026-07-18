import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

interface TypewriterTitleProps {
	text: string;
	fontSize: number;
	textColor: string;
	backgroundColor: string;
}

export const TypewriterTitle: React.FC<TypewriterTitleProps> = ({
	text,
	fontSize,
	textColor,
	backgroundColor,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// Typewriter effect - show characters one by one
	const charFrames = 3; // Each character appears every 3 frames
	const typedChars = Math.min(Math.floor(frame / charFrames), text.length);
	const typedText = text.slice(0, typedChars);

	// Cursor blink animation
	const cursorBlinkFrames = 16;
	const cursorOpacity = Math.floor(frame / cursorBlinkFrames) % 2 === 0 ? 1 : 0;

	return (
		<AbsoluteFill
			style={{
				backgroundColor,
				justifyContent: 'center',
				alignItems: 'center',
				padding: '0 100px',
			}}
		>
			<div
				style={{
					color: textColor,
					fontSize,
					fontWeight: 700,
					fontFamily: 'monospace',
					display: 'flex',
					alignItems: 'center',
				}}
			>
				<span>{typedText}</span>
				<span
					style={{
						opacity: cursorOpacity,
						marginLeft: '5px',
					}}
				>
					|
				</span>
			</div>
		</AbsoluteFill>
	);
};
