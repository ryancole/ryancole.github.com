---
layout: entry
title: Note to Self: Camera-driven Mesh Rotation in Unreal Engine
---

The official unreal engine shooter game sample project uses the "floating arms" approach for its first person camera and mesh. The project just uses the default camera created within the default classes provided by the engine - it does not explicitly create its own camera. Player input drives the camera rotation. Camera rotation drives the first person mesh's rotation.

The below code is from the `AShooterPlayerCameraManager` class. This code changes the camera's FOV based on the firing mode, but also calls the `OnCameraUpdate` method of the `AShooterCharacter` class.

```cpp
void AShooterPlayerCameraManager::UpdateCamera(float DeltaTime)
{
	AShooterCharacter* MyPawn = PCOwner ? Cast<AShooterCharacter>(PCOwner->GetPawn()) : NULL;
	if (MyPawn && MyPawn->IsFirstPerson())
	{
		const float TargetFOV = MyPawn->IsTargeting() ? TargetingFOV : NormalFOV;
		DefaultFOV = FMath::FInterpTo(DefaultFOV, TargetFOV, DeltaTime, 20.0f);
	}

	Super::UpdateCamera(DeltaTime);

	if (MyPawn && MyPawn->IsFirstPerson())
	{
		MyPawn->OnCameraUpdate(GetCameraLocation(), GetCameraRotation());
	}
}
```

The below code is the `OnCameraUpdate` that is called from the above method. This method below is the one that drives the first person mesh's rotation. The code below always uses the default `RelativeRotation` and `RelativeLocation` of the first person mesh, as opposed to maintaining some sort of progressively-updated rotation and location variables.

```cpp
void AShooterCharacter::OnCameraUpdate(const FVector& CameraLocation, const FRotator& CameraRotation)
{
	USkeletalMeshComponent* DefMesh1P = Cast<USkeletalMeshComponent>(GetClass()->GetDefaultSubobjectByName(TEXT("PawnMesh1P")));

	const FMatrix DefMeshLS = FRotationTranslationMatrix(DefMesh1P->RelativeRotation, DefMesh1P->RelativeLocation);
	const FMatrix LocalToWorld = ActorToWorld().ToMatrixWithScale();

	// Mesh rotating code expect uniform scale in LocalToWorld matrix

	const FRotator RotCameraPitch(CameraRotation.Pitch, 0.0f, 0.0f);
	const FRotator RotCameraYaw(0.0f, CameraRotation.Yaw, 0.0f);

	const FMatrix LeveledCameraLS = FRotationTranslationMatrix(RotCameraYaw, CameraLocation) * LocalToWorld.Inverse();
	const FMatrix PitchedCameraLS = FRotationMatrix(RotCameraPitch) * LeveledCameraLS;
	const FMatrix MeshRelativeToCamera = DefMeshLS * LeveledCameraLS.Inverse();
	const FMatrix PitchedMesh = MeshRelativeToCamera * PitchedCameraLS;

	Mesh1P->SetRelativeLocationAndRotation(PitchedMesh.GetOrigin(), PitchedMesh.Rotator());
}
```

The first line gets our default sub-object so that we can reference the default values - `Cast<USkeletalMeshComponent>(GetClass()->GetDefaultSubobjectByName(TEXT("PawnMesh1P")))`.

The last line, `Mesh1P->SetRelativeLocationAndRotation(PitchedMesh.GetOrigin(), PitchedMesh.Rotator())`, applies these calculated changes to the active mesh for this instance.

The overall premise here is to make the camera's rotation be the driving force behind the mesh's rotation.
