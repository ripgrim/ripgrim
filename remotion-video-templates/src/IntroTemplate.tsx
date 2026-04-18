import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';

interface IntroTemplateProps {
	title: string;
	subtitle: string;
	backgroundColor: string;
	textColor: string;
}

export const IntroTemplate: React.FC<IntroTemplateProps> = ({
	title,
	subtitle,
	backgroundColor,
	textColor,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// Fade in animation
	const opacity = interpolate(frame, [0, 30], [0, 1], {
		extrapolateRight: 'clamp',
	});

	// Scale up animation
	const scale = interpolate(frame, [0, 45], [0.8, 1], {
		extrapolateRight: 'clamp',
	});

	// Slide up animation for subtitle
	const subtitleTranslateY = interpolate(frame, [30, 60], [50, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const subtitleOpacity = interpolate(frame, [30, 60], [0, 1], {
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor,
				justifyContent: 'center',
				alignItems: 'center',
			}}
		>
			<div
				style={{
					transform: `scale(${scale})`,
					opacity,
					textAlign: 'center',
				}}
			>
				<h1
					style={{
						color: textColor,
						fontSize: 120,
						fontWeight: 800,
						margin: 0,
						fontFamily: 'system-ui, -apple-system, sans-serif',
						letterSpacing: '-2px',
					}}
				>
					{title}
				</h1>
				<p
					style={{
						color: textColor,
						fontSize: 48,
						fontWeight: 400,
						margin: '20px 0 0 0',
						fontFamily: 'system-ui, -apple-system, sans-serif',
						opacity: subtitleOpacity,
						transform: `translateY(${subtitleTranslateY}px)`,
					}}
				>
					{subtitle}
				</p>
			</div>
		</AbsoluteFill>
	);
};
