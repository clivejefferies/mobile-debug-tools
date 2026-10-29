#import <UIKit/UIKit.h>
@interface ReadinessApp : UIResponder <UIApplicationDelegate>
@property(strong, nonatomic) UIWindow *window;
@property(strong, nonatomic) UILabel *status;
@property(strong, nonatomic) UIActivityIndicatorView *loader;
@property(nonatomic) NSInteger generation;
@end
@implementation ReadinessApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  UIViewController *controller = [UIViewController new]; controller.view.backgroundColor = UIColor.whiteColor;
  self.window.rootViewController = controller;
  UILabel *ready = [[UILabel alloc] initWithFrame:CGRectMake(30, 140, 300, 50)]; ready.text = @"Ready"; ready.accessibilityIdentifier = @"ready";
  [controller.view addSubview:ready];
  self.status = [[UILabel alloc] initWithFrame:CGRectMake(30, 200, 300, 50)]; self.status.text = @"Idle"; [controller.view addSubview:self.status];
  self.loader = [[UIActivityIndicatorView alloc] initWithActivityIndicatorStyle:UIActivityIndicatorViewStyleMedium]; self.loader.frame = CGRectMake(30, 260, 50, 50); [controller.view addSubview:self.loader];
  UIButton *start = [UIButton buttonWithType:UIButtonTypeSystem]; start.frame = CGRectMake(30, 340, 300, 60);
  [start setTitle:@"Show loader" forState:UIControlStateNormal]; start.accessibilityIdentifier = @"show-loader";
  [start addTarget:self action:@selector(showLoader) forControlEvents:UIControlEventTouchUpInside]; [controller.view addSubview:start];
  [self.window makeKeyAndVisible]; return YES;
}
- (void)showLoader {
  NSInteger current = ++self.generation; self.status.text = @"Loading"; [self.loader startAnimating];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 12 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ if (current == self.generation) { self.status.text = @"Done"; [self.loader stopAnimating]; } });
}
@end
int main(int argc, char **argv) { @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(ReadinessApp.class)); } }
