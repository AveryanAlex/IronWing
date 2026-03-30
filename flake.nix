{
  description = "IronWing development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";
    flake-utils = {
      url = "github:numtide/flake-utils";
      inputs.systems.follows = "systems";
    };
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs =
    {
      nixpkgs,
      systems,
      flake-utils,
      rust-overlay,
      ...
    }:
    flake-utils.lib.eachSystem (import systems) (
      system:
      let
        overlays = [
          (import rust-overlay)
        ];
        pkgs = import nixpkgs {
          inherit system overlays;
          config.allowUnfree = true;
          config.android_sdk.accept_license = true;
        };

        lib = pkgs.lib;

        ndkVersion = "27.3.13750724";

        androidComposition = pkgs.androidenv.composeAndroidPackages {
          platformVersions = [
            "34"
            "36"
          ];
          buildToolsVersions = [
            "35.0.0"
            "36.1.0"
          ];
          includeNDK = true;
          ndkVersions = [ ndkVersion ];
          abiVersions = [
            "arm64-v8a"
            "armeabi-v7a"
            "x86_64"
          ];
          includeEmulator = false;
          includeSources = false;
          includeSystemImages = false;
        };

        androidSdk = androidComposition.androidsdk;

        jdk = pkgs.jdk17;

        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [
            "clippy"
            "rust-analyzer"
            "rust-src"
            "rustfmt"
          ];
          targets = [
            "aarch64-linux-android"
            "armv7-linux-androideabi"
            "i686-linux-android"
            "x86_64-linux-android"
          ];
        };

        linuxDeps = with pkgs; [
          atk
          cairo
          gdk-pixbuf
          glib
          glib-networking
          gtk3
          librsvg
          libsoup_3
          openssl
          pango
          udev
          webkitgtk_4_1
        ];

        darwinDeps = with pkgs.darwin.apple_sdk.frameworks; [
          AppKit
          Cocoa
          CoreFoundation
          CoreServices
          Security
          WebKit
        ];
        # Tauri CLI expects a command called "Android Studio" (with space)
        android-studio-wrapper = pkgs.runCommand "android-studio-wrapper" { } ''
          mkdir -p $out/bin
          ln -s ${pkgs.android-studio}/bin/android-studio "$out/bin/Android Studio"
        '';
      in
      {
        devShells.default = pkgs.mkShell {
          packages =
            (with pkgs; [
              android-studio
              cargo-tauri
              nodejs_latest
              pnpm
              pkg-config
              nixfmt
            ])
            ++ [
              jdk
              android-studio-wrapper
              androidSdk
              rustToolchain
            ]
            ++ lib.optionals pkgs.stdenv.isLinux linuxDeps
            ++ lib.optionals pkgs.stdenv.isDarwin darwinDeps;

          ANDROID_HOME = "${androidSdk}/libexec/android-sdk";
          NDK_HOME = "${androidSdk}/libexec/android-sdk/ndk/ndkVersion";
          JAVA_HOME = "${jdk}";
          RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";
          LD_LIBRARY_PATH = lib.optionalString pkgs.stdenv.isLinux (lib.makeLibraryPath linuxDeps);

          shellHook = ''
            export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"
            export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"
          '';
        };
      }
    );
}
