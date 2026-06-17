import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';

interface SocialMediaPostProps {
	title: string;
	description: string;
	accentColor: string;
}

export const SocialMediaPost: React.FC<SocialMediaPostProps> = ({
	title,
	description,
	accentColor,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// Background pulse animation
	const scale = interpolate(frame % 60, [0, 30, 60], [1, 1.05, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Content fade in
	const contentOpacity = interpolate(frame, [0, 30], [0, 1], {
		extrapolateRight: 'clamp',
	});

	// Title slide in
	const titleTranslateY = interpolate(frame, [15, 45], [30, 0], {
		extrapolateRight: 'clamp',
	});

	// Description slide in with delay
	const descTranslateY = interpolate(frame, [30, 60], [30, 0], {
		extrapolateRight: 'clamp',
	});
	const descOpacity = interpolate(frame, [30, 60], [0, 1], {
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}44)`,
				justifyContent: 'center',
				alignItems: 'center',
				padding: '80px',
			}}
		>
			<div
				style={{
					transform: `scale(${scale})`,
					opacity: contentOpacity,
					background: 'white',
					borderRadius: '30px',
					padding: '60px',
					boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
					width: '100%',
					maxWidth: '800px',
				}}
			>
				<div
					style={{
						transform: `translateY(${titleTranslateY}px)`,
						marginBottom: '30px',
					}}
				>
					<h1
						style={{
							color: accentColor,
							fontSize: 64,
							fontWeight: 800,
							margin: 0,
							fontFamily: 'system-ui, -apple-system, sans-serif',
							lineHeight: 1.2,
						}}
					>
						{title}
					</h1>
				</div>
				<div
					style={{
						transform: `translateY(${descTranslateY}px)`,
						opacity: descOpacity,
					}}
				>
					<p
						style={{
							color: '#666',
							fontSize: 32,
							lineHeight: 1.6,
							margin: 0,
							fontFamily: 'system-ui, -apple-system, sans-serif',
						}}
					>
						{description}
					</p>
				</div>
				<div
					style={{
						marginTop: '40px',
						height: '4px',
						background: `linear-gradient(90deg, ${accentColor}, ${accentColor}66)`,
						borderRadius: '2px',
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};
