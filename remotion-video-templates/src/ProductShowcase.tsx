import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';

interface ProductShowcaseProps {
	productName: string;
	tagline: string;
	primaryColor: string;
	secondaryColor: string;
}

export const ProductShowcase: React.FC<ProductShowcaseProps> = ({
	productName,
	tagline,
	primaryColor,
	secondaryColor,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// Background gradient animation
	const gradientAngle = interpolate(frame, [0, 240], [0, 360], {
		extrapolateRight: 'clamp',
	});

	// Product card entrance
	const cardScale = interpolate(frame, [0, 45], [0.9, 1], {
		extrapolateRight: 'clamp',
	});
	const cardOpacity = interpolate(frame, [0, 45], [0, 1], {
		extrapolateRight: 'clamp',
	});

	// Product name animation
	const nameTranslateY = interpolate(frame, [30, 60], [40, 0], {
		extrapolateRight: 'clamp',
	});
	const nameOpacity = interpolate(frame, [30, 60], [0, 1], {
		extrapolateRight: 'clamp',
	});

	// Tagline animation with delay
	const taglineTranslateY = interpolate(frame, [60, 90], [30, 0], {
		extrapolateRight: 'clamp',
	});
	const taglineOpacity = interpolate(frame, [60, 90], [0, 1], {
		extrapolateRight: 'clamp',
	});

	// CTA button pulse
	const buttonScale = interpolate(frame % 60, [0, 30, 60], [1, 1.08, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				background: `linear-gradient(${gradientAngle}deg, ${primaryColor}, ${secondaryColor})`,
				justifyContent: 'center',
				alignItems: 'center',
				padding: '80px',
			}}
		>
			<div
				style={{
					transform: `scale(${cardScale})`,
					opacity: cardOpacity,
					background: 'white',
					borderRadius: '40px',
					padding: '80px',
					boxShadow: '0 30px 80px rgba(0,0,0,0.2)',
					width: '100%',
					maxWidth: '1200px',
					textAlign: 'center',
				}}
			>
				<div
					style={{
						transform: `translateY(${nameTranslateY}px)`,
						opacity: nameOpacity,
						marginBottom: '40px',
					}}
				>
					<h1
						style={{
							background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
							WebkitBackgroundClip: 'text',
							WebkitTextFillColor: 'transparent',
							backgroundClip: 'text',
							fontSize: 96,
							fontWeight: 900,
							margin: 0,
							fontFamily: 'system-ui, -apple-system, sans-serif',
							letterSpacing: '-3px',
						}}
					>
						{productName}
					</h1>
				</div>
				<div
					style={{
						transform: `translateY(${taglineTranslateY}px)`,
						opacity: taglineOpacity,
						marginBottom: '60px',
					}}
				>
					<p
						style={{
							color: '#888',
							fontSize: 42,
							fontWeight: 400,
							margin: 0,
							fontFamily: 'system-ui, -apple-system, sans-serif',
							lineHeight: 1.4,
						}}
					>
						{tagline}
					</p>
				</div>
				<div
					style={{
						transform: `scale(${buttonScale})`,
						background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
						color: 'white',
						fontSize: 28,
						fontWeight: 700,
						padding: '24px 64px',
						borderRadius: '50px',
						display: 'inline-block',
						fontFamily: 'system-ui, -apple-system, sans-serif',
						boxShadow: `0 10px 30px ${primaryColor}66`,
					}}
				>
					Learn More
				</div>
			</div>
		</AbsoluteFill>
	);
};
