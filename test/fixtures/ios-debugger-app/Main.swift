import UIKit

@inline(never) func increment(_ value: Int) -> Int {
    let adjusted = value + 1 // STEP_INCREMENT
    return adjusted // STEP_RETURN
}
@inline(never) func helper(_ value: Int) -> Int {
    let result = increment(value) // STEP_HELPER
    return result // HELPER_RETURN
}
actor AsyncWork {
    func child(_ input: Int) async -> Int {
        try? await Task.sleep(nanoseconds: 300_000_000)
        let childValue = input + 1
        return childValue // CHILD_RETURN
    }
    @inline(never) func calculate(_ seed: Int) async -> Int {
        let known = seed
        async let childResult = child(known)
        let after = await childResult // BEFORE_AWAIT
        let answer = helper(after + known - seed) // AFTER_AWAIT
        return answer // ASYNC_RETURN
    }
}
class Controller: UIViewController {
    let label = UILabel()
    var task: Task<Void, Never>?
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        label.text = "Debugger ready"
        label.accessibilityIdentifier = "debugger-result"
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 24
        stack.addArrangedSubview(label)
        for (title, action) in [("Calculate", #selector(calculate)), ("Run async", #selector(runAsync)), ("Start cancellation", #selector(startCancellation)), ("Cancel task", #selector(cancelTask))] {
            let button = UIButton(type: .system)
            button.setTitle(title, for: .normal)
            button.addTarget(self, action: action, for: .touchUpInside)
            stack.addArrangedSubview(button)
        }
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo: view.centerXAnchor), stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
    }
    @objc func calculate() {
        let known = 41
        let result = helper(known) // BREAK_CALCULATE
        label.text = "Debugger result \(result)" // CALCULATE_DONE
    }
    @objc func runAsync() {
        task = Task { @MainActor in
            let result = await AsyncWork().calculate(42)
            label.text = "Async result \(result)"
        }
    }
    @objc func startCancellation() {
        label.text = "Task running"
        task = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: 60_000_000_000)
                label.text = "Unexpected completion"
            } catch {
                let cancelled = Task.isCancelled
                label.text = cancelled ? "Task cancelled" : "Unexpected error" // CANCELLED
            }
        }
    }
    @objc func cancelTask() { task?.cancel() }
}
@main class App: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = Controller()
        window?.makeKeyAndVisible()
        // Test-only control channel; no HID dependency or debugger evaluation.
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            let commandFile = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("debugger-command")
            guard let command = try? String(contentsOf: commandFile, encoding: .utf8),
                  let controller = self?.window?.rootViewController as? Controller else { return }
            try? FileManager.default.removeItem(at: commandFile)
            switch command {
            case "exit": exit(0)
            case "calculate": controller.calculate()
            case "async": controller.runAsync()
            case "start-cancellation": controller.startCancellation()
            case "cancel": controller.cancelTask()
            default: break
            }
        }
        return true
    }
}
